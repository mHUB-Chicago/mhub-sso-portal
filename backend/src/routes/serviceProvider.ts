import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role } from "@/database/models";
import { CreateServiceProviderRequestSchema, CreateServiceProviderResponseSchema, GetServiceProviderResponseSchema, GetServiceProvidersResponseSchema, UpdateServiceProviderRequestSchema, UpdateServiceProviderResponseSchema } from "@common/schemas/serviceProvider";
import { handleCreateServiceProvider, handleDeleteServiceProvider, handleGetServiceProviderById, handleGetServiceProviders, handleUpdateServiceProvider } from "@/controllers/serviceProviderController";

const app = new Hono<AppType>();

app.get(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get service providers",
    successMessage: "Service providers retrieved successfully",
    responseSchema: GetServiceProvidersResponseSchema,
  }),
  handleGetServiceProviders
);

app.get(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get service provider by ID",
    successMessage: "Service provider information retrieved successfully",
    responseSchema: GetServiceProviderResponseSchema,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  handleGetServiceProviderById
);

app.post(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Create service provider",
    successMessage: "Service provider created successfully",
    responseSchema: CreateServiceProviderResponseSchema,
  }),
  validate(CreateServiceProviderRequestSchema, "form"),
  handleCreateServiceProvider
)

app.put(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Update service provider",
    successMessage: "Service provider updated successfully",
    responseSchema: UpdateServiceProviderResponseSchema,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  validate(UpdateServiceProviderRequestSchema, "form"),
  handleUpdateServiceProvider
);

app.delete(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Delete service provider",
    successMessage: "Service provider deleted successfully",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" }
      }
    ]
  }),
  handleDeleteServiceProvider
)

export default app;
