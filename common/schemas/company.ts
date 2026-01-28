import z from "zod";
import { SuccessResponseSchema } from "./response";
import { ServiceProviderSchema } from "./serviceProvider";

export const CompanySchema = z.object({
  id: z.string(),
  peopleVineId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const GetCompaniesRequestSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  active: z.boolean().optional(),
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