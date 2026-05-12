import z from "zod";
import { SuccessResponseSchema } from "./response";

export const ServiceProviderSchema = z.object({
  id: z.string(),
  name: z.string(), // Display name for the service provider, this is shown on the speedbump page/edit user interface
  active: z.boolean(), // Whether the service provider is active or not
  logo: z.string(), // As a Base64 encoded image string
  entityId: z.string(), // this is the Entity ID from the SP metadata
  acsUrl: z.string(), // this is the Assertion Consumer Service URL from the SP metadata
  loginUrl: z.string(), // This is used for the speedbump to link users to the correct place after clicking the app
  signTarget: z.enum(['ASSERTION', 'RESPONSE', 'BOTH']), // This is usually just always ASSERTION, but some service providers use other ones. ASSERTION should be default value in form.
  autoRedirect: z.boolean(), // Whether to automatically redirect to the SP without showing the speedbump page
  createdAt: z.coerce.date().transform(d => d.toISOString()),
  updatedAt: z.coerce.date().transform(d => d.toISOString()),
});

export const GetServiceProvidersResponseSchema = SuccessResponseSchema(z.object({
  serviceProviders: z.array(ServiceProviderSchema),
}));

export const GetServiceProviderResponseSchema = SuccessResponseSchema(z.object({
  serviceProvider: ServiceProviderSchema
}));

export const CreateServiceProviderRequestSchema = z.object({
  name: z.string(),
  logo: z.any(), // File upload
  entityId: z.string(),
  acsUrl: z.string(),
  loginUrl: z.string(),
  signTarget: z.enum(['ASSERTION', 'RESPONSE', 'BOTH']).default('ASSERTION'),
  autoRedirect: z.enum(['true', 'false']).default('false'),
});

export const CreateServiceProviderResponseSchema = SuccessResponseSchema(z.object({
  serviceProvider: ServiceProviderSchema,
}));

export const UpdateServiceProviderRequestSchema = z.object({
  name: z.string().optional(),
  logo: z.any().optional(), // File upload
  active: z.enum(['true', 'false']).optional(),
  entityId: z.string().optional(),
  acsUrl: z.string().optional(),
  loginUrl: z.string().optional(),
  signTarget: z.enum(['ASSERTION', 'RESPONSE', 'BOTH']).optional(),
  autoRedirect: z.enum(['true', 'false']).optional(),
});

export const UpdateServiceProviderResponseSchema = SuccessResponseSchema(z.object({
  serviceProvider: ServiceProviderSchema,
}));

export const DeleteServiceProviderResponseSchema = SuccessResponseSchema();
