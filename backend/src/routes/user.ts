import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { GetMyUserResponseSchema } from "@common/schemas/user";
import { handleGetMyUser } from "@/controllers/userController";

const app = new Hono<AppType>();

app.get(
  "/me",
  describeRoute({
    summary: "Get my user information",
    successMessage: "User information retrieved successfully",
    responseSchema: GetMyUserResponseSchema,
  }),
  handleGetMyUser
);

export default app;
