import { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { AppType, JsonInput } from "..";
import { ChangePasswordRequestSchema, ChangePasswordResponseSchema, ForgotPasswordRequestSchema, ForgotPasswordResponseSchema, LogoutResponseSchema, StartLoginRequestSchema, StartLoginResponseSchema, VerifyLoginRequestSchema, VerifyLoginResponseSchema } from "@common/schemas/login";
import { getUserByEmail, getUserById, updateUser } from "@/services/userService";
import { hasPortalAccess } from "@/services/peopleVineService";
import { createSession, revokeSession } from "@/services/sessionService";
import { createLoginRequest, verifyLoginRequest } from "@/services/loginRequestService";
import { FailedResponseSchema } from "@common/schemas/response";
import { getAllowedServiceProvidersForUser } from "@/services/userServiceProviderService";
import { getOnboardingPaymentFormUrl } from "@/controllers/onboardingController";
import { getSessionId } from "@/middleware/auth";

export const handleStartLogin = async (c: Context<AppType, string, JsonInput<typeof StartLoginRequestSchema>>) => {
  try {
    const { email } = c.req.valid("json");
    const user = await getUserByEmail(c, email);
    if (!user) {
      throw new Error("User not found");
    }
    // pending_membership users haven't completed their subscription yet, so they never
    // pass hasPortalAccess — but they still need to log in to reach the onboarding
    // payment form (the whole point of the returnTo gate in sendOnboardingPaymentFormEmail).
    if (user.role !== 'ADMIN' && user.accountStatus !== 'pending_membership' && !(await hasPortalAccess(c, user.primaryMembership, user.addOns))) {
      throw new Error("No portal access");
    }
    if (user.email.endsWith('@noemail.mhub')) {
      return c.json({ success: false, message: "Your account is not fully set up. Please contact mHUB to complete your registration." }, 400);
    }
    const loginRequest = await createLoginRequest(c, { email: user.email });
    // Here you would normally create a login flow/session and send back necessary info
    const response = StartLoginResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        request_id: loginRequest.id,
        // Also excludes anyone who already completed payment — accountStatus can lag
        // behind onboardingPaymentAgreementAt while waiting on the PV subscription sync
        // (see "Subscription Applied" in the onboarding progress tracker), and re-sending
        // an already-paid member back to the payment form on every login is exactly the
        // bug this field exists to prevent.
        isPendingMembership: user.role !== 'ADMIN' && user.accountStatus === 'pending_membership' && !user.onboardingPaymentAgreementAt,
      },
    });
    return c.json(response);
  } catch (error) {
    console.error("handleStartLogin error:", error);

    // Still return a response with a fake request_id to avoid user enumeration —
    // isPendingMembership defaults to false here for the same reason, so the field's
    // presence/value never reveals whether the email actually exists.
    const randomUUID = crypto.randomUUID();
    const response = StartLoginResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        request_id: randomUUID,
        isPendingMembership: false,
      },
    });
    return c.json(response);
  }
};

export const handleForgotPassword = async (c: Context<AppType, string, JsonInput<typeof ForgotPasswordRequestSchema>>) => {
  // Very similar to handleStartLogin, but ensures mustResetPassword is true
  try {
    const { email } = c.req.valid("json");
    const user = await getUserByEmail(c, email);
    if (!user) {
      throw new Error("User not found");
    }
    await updateUser(c, { id: user.id, mustResetPassword: true });
    const loginRequest = await createLoginRequest(c, { email: user.email });
    const response = ForgotPasswordResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        request_id: loginRequest.id,
      },
    });
    return c.json(response);
  } catch (error) {
    console.error("handleForgotPassword error:", error);

    // Still return a response with a fake request_id to avoid user enumeration
    const randomUUID = crypto.randomUUID();
    const response = ForgotPasswordResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        request_id: randomUUID,
      },
    });
    return c.json(response);
  }
};

export const handleVerifyLogin = async (c: Context<AppType, string, JsonInput<typeof VerifyLoginRequestSchema>>) => {
  try {
    const { request_id, password } = c.req.valid("json");
    const loginRequest = await verifyLoginRequest(c, { requestId: request_id, password });
    const user = await getUserById(c, loginRequest.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.role !== 'ADMIN' && user.accountStatus !== 'pending_membership' && !(await hasPortalAccess(c, user.primaryMembership, user.addOns))) {
      throw new Error("No portal access");
    }
    const sessionId = await createSession(c, loginRequest.userId);
    // A pending_membership user hasn't completed onboarding payment yet — send them
    // there directly regardless of how they reached /login (email link, plain login
    // page, etc.), instead of relying solely on a `returnTo` query param surviving the
    // whole email→OTP→set-password chain. Takes priority over the generic
    // auto-redirect-SP fallback below, which is for already-active members.
    // Excludes anyone who already completed payment (onboardingPaymentAgreementAt set) —
    // accountStatus only flips to "active" once the PV subscription sync confirms it
    // (see "Subscription Applied" in the onboarding progress tracker), which can lag
    // behind payment completion, so without this check an already-paid member gets sent
    // back to the payment form on every login until that sync catches up.
    const pendingOnboardingRedirectUrl = user.role !== 'ADMIN' && user.accountStatus === 'pending_membership' && !user.onboardingPaymentAgreementAt
      ? getOnboardingPaymentFormUrl(c)
      : null;
    const availableServiceProviders = await getAllowedServiceProvidersForUser(c, loginRequest.userId);
    const autoRedirectableSp = availableServiceProviders.filter(sp => sp.autoRedirect).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
    const response = VerifyLoginResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        user,
        redirectUrl: pendingOnboardingRedirectUrl ?? (autoRedirectableSp ? autoRedirectableSp.loginUrl : null),
        sessionId,
      },
    });
    return c.json(response);
  } catch (error) {
    console.error("handleVerifyLogin error:", error instanceof Error ? error.message : error);
    const response = FailedResponseSchema.parse({
      success: false,
      message: "Unauthorized",
    });
    return c.json(response, 401);
  }
};

export const handleLogout = async (c: Context<AppType>) => {
  try {
    const sessionId = getSessionId(c);
    if (sessionId) {
      await revokeSession(c, sessionId);
    }
    const isLocal = (c.env.DOMAIN as string) === "localhost";
    deleteCookie(c, "sid", {
      httpOnly: true,
      secure: !isLocal,
      sameSite: "None",
      path: "/",
      domain: c.env.DOMAIN as string,
    });
    const response = LogoutResponseSchema.parse({
      success: true,
      message: "Logged out successfully",
    });
    return c.json(response);
  } catch (error) {
    console.error("handleLogout error:", error);
    const response = FailedResponseSchema.parse({
      success: false,
      message: "Failed to log out",
    });
    return c.json(response, 400);
  }
};

export const handleChangePassword = async (c: Context<AppType, string, JsonInput<typeof ChangePasswordRequestSchema>>) => {
  try {
    const { password } = c.req.valid("json");
    const user = c.get("user");
    if (!user || !user.id) {
      throw new Error("User not authenticated");
    }
    await updateUser(c, { id: user.id, password, mustResetPassword: false });
    const response = ChangePasswordResponseSchema.parse({
      success: true,
      message: "Password changed successfully",
    });
    return c.json(response);
  } catch (error) {
    console.error("handleChangePassword error:", error);
    const response = FailedResponseSchema.parse({
      success: false,
      message: "Failed to change password",
    });
    return c.json(response, 400);
  }
};