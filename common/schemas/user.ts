import z from "zod";
import { SuccessResponseSchema } from "./response";
import { CompanySchema } from "./company";
import { ServiceProviderSchema } from "./serviceProvider";

export const UserSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  email: z.email(),
  name: z.string(),
  peopleVineId: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  emailVerified: z.boolean(),
  mustResetPassword: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AppSchema = z.object({
  name: z.string(),
  logo: z.string(),
  url: z.string(),
});

export const GetMyUserResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
  apps: z.array(AppSchema)
}));

export const GetUsersRequestSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const GetUsersResponseSchema = SuccessResponseSchema(z.object({
  users: z.array(UserSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
}));

export const GetUserResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
  company: CompanySchema,
  allowedServiceProviders: z.array(ServiceProviderSchema), // Company level allowed service providers
  enabledServiceProviders: z.array(ServiceProviderSchema), // User level enabled service providers, always a subset of allowedServiceProviderIds
}));

export const UpdateUserRequestSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(), // This is how we promote/demote users to admin
  enabledServiceProviderIds: z.array(z.string()).optional(),
});

export const UpdateUserResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
  allowedServiceProviders: z.array(ServiceProviderSchema),
  enabledServiceProviders: z.array(ServiceProviderSchema),
}));