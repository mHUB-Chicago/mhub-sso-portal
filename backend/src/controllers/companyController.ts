import { Context } from "hono";
import { AppType, JsonInput, QueryInput } from "..";
import { allowCompanyServiceProvider, getAllowedServiceProvidersForCompany, revokeCompanyServiceProvider } from "@/services/companyServiceProviderService";
import { GetCompaniesRequestSchema, GetCompaniesResponseSchema, GetCompanyResponseSchema, UpdateCompanyRequestSchema, UpdateCompanyResponseSchema } from "@common/schemas/company";
import { getCompanyById, getPaginatedCompanies, GetPaginatedCompaniesResult, updateCompany } from "@/services/companyService";
import { getAllServiceProviders } from "@/services/serviceProviderService";

export const handleGetCompanies = async (c: Context<AppType, string, QueryInput<typeof GetCompaniesRequestSchema>>) => {
  const { limit, offset, search, membershipType, active, noEmail, cmtOnly } = c.req.valid("query");
  const result: GetPaginatedCompaniesResult = await getPaginatedCompanies(c, { limit, offset, search, membershipType, active, noEmail, cmtOnly });
  const response = GetCompaniesResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      companies: result.companies,
      total: result.total,
      limit,
      offset,
    },
  });
  return c.json(response);
}

export const handleGetCompanyById = async (c: Context<AppType>) => {
  const companyId = c.req.param("id");
  const company = await getCompanyById(c, companyId);
  if (!company) {
    throw "Company not found";
  }
  const allServiceProviders = await getAllServiceProviders(c);
  const enabledServiceProviders = await getAllowedServiceProvidersForCompany(c, company.id);
  const response = GetCompanyResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      company,
      allowedServiceProviders: allServiceProviders, // All service providers are allowed at company level
      enabledServiceProviders: enabledServiceProviders,
    },
  });
  return c.json(response);
};

export const handleUpdateCompany = async (c: Context<AppType, string, JsonInput<typeof UpdateCompanyRequestSchema>>) => {
  const companyId = c.req.param("id");
  if (!companyId) {
    throw "Company ID is required";
  }
  const { enabledServiceProviderIds } = c.req.valid("json");
  const company = await getCompanyById(c, companyId);
  if (!company) {
    throw "Company not found";
  }
  const allServiceProviders = await getAllServiceProviders(c);
  const allServiceProviderIds = allServiceProviders.map(sp => sp.id);
  // Validate that the provided service provider IDs are valid
  for (const spId of enabledServiceProviderIds) {
    if (!allServiceProviderIds.includes(spId)) {
      throw `Service provider ID ${spId} is not valid`;
    }
  }

  for (const sp of allServiceProviders) {
    const isEnabled = enabledServiceProviderIds.includes(sp.id);
    if (isEnabled) {
      // Enable the service provider for the company
      await allowCompanyServiceProvider(c, {
        companyId: company.id,
        serviceProviderId: sp.id,
      });
    } else {
      // Disable the service provider for the company
      await revokeCompanyServiceProvider(c, {
        companyId: company.id,
        serviceProviderId: sp.id,
      });
    }
  }

  const updatedEnabledServiceProviders = await getAllowedServiceProvidersForCompany(c, company.id);
  const response = UpdateCompanyResponseSchema.parse({
    success: true,
    message: "Company updated successfully",
    data: {
      company,
      allowedServiceProviders: allServiceProviders,
      enabledServiceProviders: updatedEnabledServiceProviders,
    }
  });
  return c.json(response);
};