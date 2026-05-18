import z from "zod";
import { SuccessResponseSchema } from "./response";
import { CompanySchema } from "./company";
import { ServiceProviderSchema } from "./serviceProvider";

export const UserSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  email: z.string(),
  name: z.string(),
  peopleVineId: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  active: z.boolean(),
  emailVerified: z.boolean(),
  mustResetPassword: z.boolean(),
  membershipType: z.string().nullable(),
  profilePhoto: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  cardStatus: z.string().nullable(),
  memberSource: z.string().default('subscription'),
  createdAt: z.coerce.date().transform(d => d.toISOString()),
  updatedAt: z.coerce.date().transform(d => d.toISOString()),
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
  limit: z.coerce.number().min(1).max(10000).default(20),
  offset: z.coerce.number().min(0).default(0),
  role: z.enum(['USER', 'ADMIN']).optional(),
  search: z.string().optional(),
  companyId: z.string().optional(),
  membershipType: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
  portalAccess: z.enum(['true', 'false']).optional(),
  noEmail: z.enum(['true', 'false']).optional(),
  memberSource: z.enum(['subscription', 'membership']).optional(),
  cmtOnly: z.enum(['true', 'false']).optional(),
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