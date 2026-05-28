import { Context } from "hono";
import { AppType, JsonInput } from "..";
import { ChangePasswordRequestSchema, ChangePasswordResponseSchema, ForgotPasswordRequestSchema, ForgotPasswordResponseSchema, StartLoginRequestSchema, StartLoginResponseSchema, VerifyLoginRequestSchema, VerifyLoginResponseSchema } from "@common/schemas/login";
import { getUserByEmail, getUserByUsername, getUserById, updateUser } from "@/services/userService";
import { hasPortalAccess } from "@/services/peopleVineService";
import { createSession } from "@/services/sessionService";
import { createLoginRequest, verifyLoginRequest } from "@/services/loginRequestService";
import { FailedResponseSchema } from "@common/schemas/response";
import { getAllowedServiceProvidersForUser } from "@/services/userServiceProviderService";

export const handleStartLogin = async (c: Context<AppType, string, JsonInput<typeof StartLoginRequestSchema>>) => {
  try {
    const { email } = c.req.valid("json");
    const user = await getUserByEmail(c, email) ?? await getUserByUsername(c, email);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.role !== 'ADMIN' && !(await hasPortalAccess(c, user.primaryMembership))) {
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
      },
    });
    return c.json(response);
  } catch (error) {
    console.error("handleStartLogin error:", error);

    // Still return a response with a fake request_id to avoid user enumeration
    const randomUUID = crypto.randomUUID();
    const response = StartLoginResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        request_id: randomUUID,
      },
    });
    return c.json(response);
  }
};

export const handleForgotPassword = async (c: Context<AppType, string, JsonInput<typeof ForgotPasswordRequestSchema>>) => {
  // Very similar to handleStartLogin, but ensures mustResetPassword is true
  try {
    const { email } = c.req.valid("json");
    const user = await getUserByEmail(c, email) ?? await getUserByUsername(c, email);
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
    if (user.role !== 'ADMIN' && !(await hasPortalAccess(c, user.primaryMembership))) {
      throw new Error("No portal access");
    }
    const sessionId = await createSession(c, loginRequest.userId);
    const availableServiceProviders = await getAllowedServiceProvidersForUser(c, loginRequest.userId);
    const autoRedirectableSp = availableServiceProviders.filter(sp => sp.autoRedirect).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
    const response = VerifyLoginResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        user,
        redirectUrl: autoRedirectableSp ? autoRedirectableSp.loginUrl : null,
        sessionId,
      },
    });
    return c.json(response);
  } catch (error) {
    console.error("handleVerifyLogin error:", error);
    const response = FailedResponseSchema.parse({
      success: false,
      message: "Unauthorized",
    });
    return c.json(response, 401);
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