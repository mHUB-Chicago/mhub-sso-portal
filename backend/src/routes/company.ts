import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { GetCompaniesRequestSchema, GetCompaniesResponseSchema, GetCompanyResponseSchema, UpdateCompanyRequestSchema, UpdateCompanyResponseSchema } from "@common/schemas/company";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role } from "@/database/models";
import { handleGetCompanies, handleGetCompanyById, handleUpdateCompany } from "@/controllers/companyController";

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

export default app;
