import z from "zod";
import { SuccessResponseSchema } from "./response";
import { UserSchema } from "./user";

export const StartLoginRequestSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  // The pending SAML transaction, if this login came from an SP — lets the backend tell
  // whether the login will end in PV (see peopleVineLandingUrl).
  tx: z.string().optional(),
});
export const StartLoginResponseSchema = SuccessResponseSchema(z.object({
  request_id: z.string(),
  // Lets the login page decide, before the password step is even submitted, whether
  // it should pre-open the onboarding payment tab — that tab must only ever appear
  // for pending_membership users, never for a regular active-member login.
  isPendingMembership: z.boolean(),
  // True when this login's Step 2 takes an emailed access code (no password set yet,
  // unverified email, or a forced reset) — same rule as createLoginRequest's needsOtp.
  // Lets the login page tell an access-code pass (which goes on to change-password, not
  // SSO) from a real password login before submitting, so the fake PV tab only opens
  // for the latter.
  requiresOtp: z.boolean(),
  // Set only while the onboarding payment form is pending. PV ignores RelayState and
  // lands on the last PV page viewed in the browser, so the login page loads this URL
  // in a pre-opened tab first. Every other login SSOs into PV in the same tab.
  peopleVineLandingUrl: z.string().nullable(),
}));

export const VerifyLoginRequestSchema = z.object({
  request_id: z.string().min(1, "Request ID is required"),
  password: z.string().min(1, "Password is required"),
});
export const VerifyLoginResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
  redirectUrl: z.string().nullable(),
  sessionId: z.string().optional(),
}));

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
});
export const ForgotPasswordResponseSchema = SuccessResponseSchema(z.object({
  request_id: z.string()
}));

export const ChangePasswordRequestSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters long"),
});
export const ChangePasswordResponseSchema = SuccessResponseSchema();

export const LogoutResponseSchema = SuccessResponseSchema();