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
  primaryMembership: z.string().nullable(),
  primaryMembershipStatus: z.string().nullable(),
  addOns: z.string().default('[]'),
  profilePhoto: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  cardStatus: z.string().nullable(),
  memberSource: z.string().default('subscription'),
  memberSourceCompany: z.string().nullable(),
  membershipStatus: z.string().optional(),
  // "pending_membership" | "membership-removed" | "active" — lets the frontend poll
  // /user/me during the onboarding payment redirect to detect completion without
  // relying on PeopleVine's own post-submit page behavior (outside our control).
  accountStatus: z.string(),
  onboardingPaymentAgreementAt: z.coerce.date().nullable().transform(d => d ? d.toISOString() : null),
  // Membership Agreement e-signature — additive, unrelated to the PV-driven fields
  // above. membershipAgreementPdf (the signed PDF itself, large) is deliberately left
  // off this shared schema — it's only added to GetUserResponseSchema below, so it
  // isn't fetched/serialized for every row in a paginated admin user list.
  membershipAgreementSignedAt: z.coerce.date().nullable().transform(d => d ? d.toISOString() : null),
  membershipAgreementSignedName: z.string().nullable(),
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
  primaryMembership: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
  portalAccess: z.enum(['true', 'false']).optional(),
  primaryMembershipStatus: z.enum(['Active', 'Cancelled']).optional(),
  noEmail: z.enum(['true', 'false']).optional(),
  noName: z.enum(['true', 'false']).optional(),
  noPrimary: z.enum(['true', 'false']).optional(),
  directPersonal: z.enum(['true', 'false']).optional(),
  unresolved: z.enum(['true', 'false']).optional(),
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
  // The signed Membership Agreement PDF (base64 data URI) — kept off the shared
  // UserSchema (see there) since this is only needed on this single-user detail
  // fetch, not the paginated user list.
  membershipAgreementPdf: z.string().nullable(),
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