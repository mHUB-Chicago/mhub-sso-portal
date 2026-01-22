import { Hono } from "hono";
import { AppType } from "@/index";
import { validate } from "@/middleware/validate";
import { describeRoute } from "@/utils/describeRoute";
import { ChangePasswordRequestSchema, ChangePasswordResponseSchema, ForgotPasswordRequestSchema, ForgotPasswordResponseSchema, StartLoginRequestSchema, StartLoginResponseSchema, VerifyLoginRequestSchema, VerifyLoginResponseSchema } from "@common/schemas/login";
import { handleChangePassword, handleForgotPassword, handleStartLogin, handleVerifyLogin } from "@/controllers/loginController";

const app = new Hono<AppType>();

app.post(
  "/start",
  describeRoute({
    summary: "Start login flow",
    successMessage: "Login flow started successfully",
    responseSchema: StartLoginResponseSchema
  }),
  validate(StartLoginRequestSchema),
  handleStartLogin
);

app.post(
  "/verify",
  describeRoute({
    summary: "Verify login credentials",
    successMessage: "Login verified successfully",
    responseSchema: VerifyLoginResponseSchema,
  }),
  validate(VerifyLoginRequestSchema),
  handleVerifyLogin
);

app.post(
  "/forgot-password",
  describeRoute({
    summary: "Request password reset",
    successMessage: "Password reset requested successfully",
    responseSchema: ForgotPasswordResponseSchema,
  }),
  validate(ForgotPasswordRequestSchema),
  handleForgotPassword
);

app.post(
  "/change-password",
  describeRoute({
    summary: "Change user password",
    successMessage: "Password changed successfully",
    responseSchema: ChangePasswordResponseSchema,
  }),
  validate(ChangePasswordRequestSchema),
  handleChangePassword
)

export default app;
