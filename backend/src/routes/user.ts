import { Hono } from "hono";
import { AppType } from "@/index";
import { validate } from "@/middleware/validate";
import { describeRoute } from "@/utils/describeRoute";
import { Role } from "@/database/models";
import { roleMiddleware } from "@/middleware/role";
import z from "zod";

const app = new Hono<AppType>();

app.get(
  "/me",
  roleMiddleware([Role.USER, Role.ADMIN]),
  describeRoute({
    summary: "Retrieve the current user",
    successMessage: "User retrieved successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema
  }),
  (c) => c.json({})
);

app.get(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Retrieve users associated with the current company",
    successMessage: "Users retrieved successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema
  }),
  (c) => c.json({})
);

app.post(
  "/login",
  describeRoute({
    summary: "Login a user",
    successMessage: "User logged in successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema,
  }),
  validate(z.any()), // TODO: Replace with actual schema  
  (c) => c.json({})
);

app.post(
  "/verify-email",
  describeRoute({
    summary: "Verify a user's email",
    successMessage: "User email verified successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema
  }),
  (c) => c.json({})
);

app.post(
  "/forgot-password",
  describeRoute({
    summary: "Initiate password reset process",
    successMessage: "Password reset initiated successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema
  }),
  validate(z.any()), // TODO: Replace with actual schema
  (c) => c.json({})
);

app.post(
  "/reset-password",
  describeRoute({
    summary: "Reset my user's password",
    successMessage: "Password reset successfully",
    responseSchema: z.any(), // TODO: Replace with actual schema
  }),
  validate(z.any()), // TODO: Replace with actual schema
  (c) => c.json({})
);

export default app;
