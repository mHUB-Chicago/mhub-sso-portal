import { createServiceProvider, CreateServiceProviderInput, deleteServiceProvider, getAllServiceProviders, getServiceProviderById, updateServiceProvider, UpdateServiceProviderInput } from "@/services/serviceProviderService";
import { CreateServiceProviderRequestSchema, CreateServiceProviderResponseSchema, DeleteServiceProviderResponseSchema, GetServiceProviderResponseSchema, GetServiceProvidersResponseSchema, UpdateServiceProviderRequestSchema, UpdateServiceProviderResponseSchema } from "@common/schemas/serviceProvider";
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
  const body = await c.req.parseBody();
  const createServiceProviderBody = CreateServiceProviderRequestSchema.parse(body);
  const createServiceProviderInput: CreateServiceProviderInput = {
    name: createServiceProviderBody.name,
    entityId: createServiceProviderBody.entityId,
    acsUrl: createServiceProviderBody.acsUrl,
    loginUrl: createServiceProviderBody.loginUrl,
    signTarget: createServiceProviderBody.signTarget,
    logo: "",
  };
  const logo = body["logo"];
  if (logo && logo instanceof File) {
    const arrayBuffer = await logo.arrayBuffer();
    const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    createServiceProviderInput.logo = `data:${logo.type};base64,${base64String}`;
  } else if (logo) {
    throw "Invalid logo file";
  } else {
    throw "Logo file is required";
  }
  const newServiceProvider = await createServiceProvider(c, createServiceProviderInput);
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
  const serviceProviderId = c.req.param("id");
  const body = await c.req.parseBody();
  const updateServiceProviderBody = UpdateServiceProviderRequestSchema.parse(body);
  const serviceProvider = await getServiceProviderById(c, serviceProviderId);
  if (!serviceProvider) {
    throw "Service provider not found";
  }
  const updateServiceProviderInput: UpdateServiceProviderInput = {
    id: serviceProvider.id,
    active: updateServiceProviderBody.active ? updateServiceProviderBody.active === 'true' : undefined,
    name: updateServiceProviderBody.name,
    entityId: updateServiceProviderBody.entityId,
    acsUrl: updateServiceProviderBody.acsUrl,
    loginUrl: updateServiceProviderBody.loginUrl,
    signTarget: updateServiceProviderBody.signTarget,
    logo: undefined,
  };
  const logo = body["logo"];
  if (logo && logo instanceof File) {
    const arrayBuffer = await logo.arrayBuffer();
    const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    updateServiceProviderInput.logo = `data:${logo.type};base64,${base64String}`;
  } else if (logo) {
    throw "Invalid logo file";
  }
  const updatedServiceProvider = await updateServiceProvider(c, updateServiceProviderInput);
  const response = UpdateServiceProviderResponseSchema.parse({
    success: true,
    message: "Service provider updated successfully",
    data: {
      serviceProvider: updatedServiceProvider,
    },
  });
  return c.json(response);
}

export const handleDeleteServiceProvider = async (c: Context) => {
  const serviceProviderId = c.req.param("id");
  const serviceProvider = await getServiceProviderById(c, serviceProviderId);
  if (!serviceProvider) {
    throw "Service provider not found";
  }
  await deleteServiceProvider(c, serviceProviderId);
  const response = DeleteServiceProviderResponseSchema.parse({
    success: true,
    message: "Service provider deleted successfully",
  });
  return c.json(response);
}