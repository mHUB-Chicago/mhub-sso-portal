import z from "zod";
import { SuccessResponseSchema } from "./response";
import { UserSchema } from "./user";

export const StartLoginRequestSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
});
export const StartLoginResponseSchema = SuccessResponseSchema(z.object({
  request_id: z.string(),
  // Lets the login page decide, before the password step is even submitted, whether
  // it should pre-open the onboarding payment tab — that tab must only ever appear
  // for pending_membership users, never for a regular active-member login.
  isPendingMembership: z.boolean(),
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