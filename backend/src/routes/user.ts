import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { GetMyUserResponseSchema, GetUserResponseSchema, GetUsersRequestSchema, GetUsersResponseSchema, UpdateUserRequestSchema, UpdateUserResponseSchema } from "@common/schemas/user";
import { handleGetMyUser, handleGetUserById, handleGetUsers, handleUpdateUser } from "@/controllers/userController";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role } from "@/database/models";

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

app.get(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get users",
    successMessage: "Users retrieved successfully",
    responseSchema: GetUsersResponseSchema,
  }),
  validate(GetUsersRequestSchema, "query"),
  handleGetUsers
)

app.get(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get user by ID",
    successMessage: "User information retrieved successfully",
    responseSchema: GetUserResponseSchema,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  handleGetUserById
);

app.put(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Update user",
    successMessage: "User updated successfully",
    responseSchema: UpdateUserResponseSchema,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  validate(UpdateUserRequestSchema),
  handleUpdateUser
);

export default app;
