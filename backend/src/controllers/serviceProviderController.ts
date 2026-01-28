import { getAllServiceProviders } from "@/services/serviceProviderService";
import { CreateServiceProviderResponseSchema, GetServiceProviderResponseSchema, GetServiceProvidersResponseSchema, UpdateServiceProviderRequestSchema, UpdateServiceProviderResponseSchema } from "@common/schemas/serviceProvider";
import { Context } from "hono";

export const handleGetServiceProviders = async (c: Context) => {
  const serviceProviders = await getAllServiceProviders(c);
  const response = GetServiceProvidersResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      serviceProviders,
    },
  });
  return c.json(response);
};

export const handleGetServiceProviderById = async (c: Context) => {
  const serviceProviderId = c.req.param("id");
  const serviceProviders = await getAllServiceProviders(c);
  const serviceProvider = serviceProviders.find(sp => sp.id === serviceProviderId);
  if (!serviceProvider) {
    throw "Service provider not found";
  }
  const response = GetServiceProviderResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      serviceProvider,
    },
  });
  return c.json(response);
};

export const handleCreateServiceProvider = async (c: Context) => {
  // TODO
  const serviceProviders = await getAllServiceProviders(c);
  const newServiceProvider = serviceProviders[0];
  const response = CreateServiceProviderResponseSchema.parse({
    success: true,
    message: "Service provider created successfully",
    data: {
      serviceProvider: newServiceProvider,
    },
  });
  return c.json(response);
}
export const handleUpdateServiceProvider = async (c: Context) => {
  // TODO
  const spId = c.req.param("id");
  const updateData = c.req.parseBody();
  const serviceProvider = await getAllServiceProviders(c).then(sps => sps.find(sp => sp.id === spId));
  if (!serviceProvider) {
    throw "Service provider not found";
  }
  const updatedServiceProvider = serviceProvider;
  const response = UpdateServiceProviderResponseSchema.parse({
    success: true,
    message: "Service provider updated successfully",
    data: {
      serviceProvider: updatedServiceProvider,
    },
  });
  return c.json(response);
}