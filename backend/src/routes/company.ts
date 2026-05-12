import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { GetCompaniesRequestSchema, GetCompaniesResponseSchema, GetCompanyResponseSchema, UpdateCompanyRequestSchema, UpdateCompanyResponseSchema } from "@common/schemas/company";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role, PrismaClient } from "@/database/models";
import { handleGetCompanies, handleGetCompanyById, handleUpdateCompany } from "@/controllers/companyController";
import { createCompany } from "@/services/companyService";

const app = new Hono<AppType>();

app.get(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get companies",
    successMessage: "Company information retrieved successfully",
    responseSchema: GetCompaniesResponseSchema,
  }),
  validate(GetCompaniesRequestSchema, "query"),
  handleGetCompanies
);

app.get(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get company by ID",
    successMessage: "Company information retrieved successfully",
    responseSchema: GetCompanyResponseSchema,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  handleGetCompanyById
);

app.put(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Update company",
    successMessage: "Company updated successfully",
    responseSchema: UpdateCompanyResponseSchema,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  validate(UpdateCompanyRequestSchema),
  handleUpdateCompany
);

app.post(
  "/import",
  roleMiddleware([Role.ADMIN]),
  async (c) => {
    const prisma: PrismaClient = c.get("db");
    const rows: { name: string; email: string; membershipType?: string; active?: boolean }[] = await c.req.json();

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.email?.trim()) { skipped++; continue; }
      const email = row.email.toLowerCase().trim();
      const name = row.name.trim();
      try {
        const existing = await prisma.company.findFirst({ where: { OR: [{ email }, { name }] } });
        if (existing) {
          await prisma.company.update({
            where: { id: existing.id },
            data: {
              name,
              membershipType: row.membershipType ?? existing.membershipType,
              active: row.active ?? existing.active,
            },
          });
          updated++;
        } else {
          await createCompany(c, {
            name,
            email,
            peopleVineId: crypto.randomUUID(),
            active: row.active ?? true,
            membershipType: row.membershipType ?? null,
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
