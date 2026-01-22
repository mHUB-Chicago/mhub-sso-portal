import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { GetMyUserResponseSchema } from "@common/schemas/user";

const app = new Hono<AppType>();

app.get(
  "/me",
  describeRoute({
    summary: "Get my user information",
    successMessage: "User information retrieved successfully",
    responseSchema: GetMyUserResponseSchema,
  }),
  async (c) => {
    const user = c.get("user");
    const response = GetMyUserResponseSchema.parse({
      success: true,
      message: "Success",
      data: {
        user,
      },
    });
    return c.json(response);
  }
);

export default app;
