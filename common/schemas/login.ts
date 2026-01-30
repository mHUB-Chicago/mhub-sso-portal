import z from "zod";
import { SuccessResponseSchema } from "./response";
import { UserSchema } from "./user";

export const StartLoginRequestSchema = z.object({
  email: z.email("Invalid email address"),
});
export const StartLoginResponseSchema = SuccessResponseSchema(z.object({
  request_id: z.string()
}));

export const VerifyLoginRequestSchema = z.object({
  request_id: z.string().min(1, "Request ID is required"),
  password: z.string().min(1, "Password is required"),
});
export const VerifyLoginResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
  redirectUrl: z.string().nullable(),
}));

export const ForgotPasswordRequestSchema = z.object({
  email: z.email("Invalid email address"),
});
export const ForgotPasswordResponseSchema = SuccessResponseSchema(z.object({
  request_id: z.string()
}));

export const ChangePasswordRequestSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters long"),
});
export const ChangePasswordResponseSchema = SuccessResponseSchema();