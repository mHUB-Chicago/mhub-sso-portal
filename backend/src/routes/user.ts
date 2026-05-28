import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { GetMyUserResponseSchema, GetUserResponseSchema, GetUsersRequestSchema, GetUsersResponseSchema, UpdateUserRequestSchema, UpdateUserResponseSchema } from "@common/schemas/user";
import { handleGetMyUser, handleGetUserById, handleGetUsers, handleUpdateUser } from "@/controllers/userController";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role, PrismaClient } from "@/database/models";
import { createUser, updateUser } from "@/services/userService";

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

app.post(
  "/import",
  roleMiddleware([Role.ADMIN]),
  async (c) => {
    const prisma: PrismaClient = c.get("db");
    const rows: { name: string; email: string; companyName?: string; primaryMembership?: string; active?: boolean; emailVerified?: boolean }[] = await c.req.json();

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.email?.trim()) { skipped++; continue; }
      const email = row.email.toLowerCase().trim();
      const name = row.name.trim();
      try {
        // Find company by name if provided
        let companyId: string | undefined;
        if (row.companyName?.trim()) {
          const company = await prisma.company.findFirst({ where: { name: row.companyName.trim() } });
          companyId = company?.id;
        }
        if (!companyId) { skipped++; continue; }

        const existing = await prisma.user.findFirst({ where: { email } });
        if (existing) {
          await updateUser(c, {
            id: existing.id,
            name,
            email,
            companyId,
            primaryMembership: row.primaryMembership ?? existing.primaryMembership,
            active: row.active ?? existing.active,
            emailVerified: row.emailVerified ?? existing.emailVerified,
          });
          updated++;
        } else {
          await createUser(c, {
            name,
            email,
            peopleVineId: crypto.randomUUID(),
            role: Role.USER,
            companyId,
            primaryMembership: row.primaryMembership ?? null,
            active: row.active ?? true,
            emailVerified: row.emailVerified ?? false,
            mustResetPassword: true,
          });
          created++;
        }
      } catch (e) {
        errors.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return c.json({ success: true, data: { created, updated, skipped, errors } });
  }
);

export default app;
