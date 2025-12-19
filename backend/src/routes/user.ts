import { Hono } from "hono";
import { AppType } from "@/index";
import { validate } from "@/middleware/validate";
import { describeRoute } from "@/utils/describeRoute";
import { Role } from "@/database/models";
import { roleMiddleware } from "@/middleware/role";
import z from "zod";
import { LoginUserRequestSchema } from "@common/schemas/user";
import { handleLoginUser } from "@/controllers/userController";

const app = new Hono<AppType>();

app.post(
  "/login",
  describeRoute({
    summary: "Login a user",
    successMessage: "User logged in successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema,
  }),
  validate(LoginUserRequestSchema),
  handleLoginUser
);

export default app;
