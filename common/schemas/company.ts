import z from "zod";
import { SuccessResponseSchema } from "./response";
import { ServiceProviderSchema } from "./serviceProvider";

export const CompanySchema = z.object({
  id: z.string(),
  peopleVineId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  active: z.boolean(),
  membershipTypes: z.string().transform(s => { try { return JSON.parse(s) as string[]; } catch { return []; } }),
  isPersonal: z.boolean(),
  createdAt: z.coerce.date().transform(d => d.toISOString()),
  updatedAt: z.coerce.date().transform(d => d.toISOString())
});

export const GetCompaniesRequestSchema = z.object({
  limit: z.coerce.number().min(1).max(10000).default(20),
  offset: z.coerce.number().min(0).default(0),
  search: z.string().optional(),
  membershipType: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  noEmail: z.enum(['true', 'false']).optional(),
});

export const GetCompaniesResponseSchema = SuccessResponseSchema(z.object({
  companies: z.array(CompanySchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
}));

export const GetCompanyResponseSchema = SuccessResponseSchema(z.object({
  company: CompanySchema,
  allowedServiceProviders: z.array(ServiceProviderSchema),
  enabledServiceProviders: z.array(ServiceProviderSchema),
}));

export const UpdateCompanyRequestSchema = z.object({
  enabledServiceProviderIds: z.array(z.string()) // Required since this is the only field that can be updated
});

export const UpdateCompanyResponseSchema = SuccessResponseSchema(z.object({
  company: CompanySchema,
  allowedServiceProviders: z.array(ServiceProviderSchema),
  enabledServiceProviders: z.array(ServiceProviderSchema),
}));