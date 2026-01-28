import { Context } from "hono";
import { AppType, JsonInput, QueryInput } from "..";
import { GetMyUserResponseSchema, GetUserResponseSchema, GetUsersRequestSchema, GetUsersResponseSchema, UpdateUserRequestSchema, UpdateUserResponseSchema } from "@common/schemas/user";
import { getPaginatedUsers, GetPaginatedUsersResult, getUserById, updateUser } from "@/services/userService";
import { allowUserServiceProvider, getAllowedServiceProvidersForUser, revokeUserServiceProvider } from "@/services/userServiceProviderService";
import { getAllowedServiceProvidersForCompany } from "@/services/companyServiceProviderService";
import { getAllServiceProviders } from "@/services/serviceProviderService";

export const handleGetMyUser = async (c: Context<AppType>) => {
  const user = c.get("user");
  const serviceProviders = await getAllowedServiceProvidersForUser(c, user.id);
  const response = GetMyUserResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      user,
      apps: serviceProviders.map(sp => ({
        name: sp.name,
        logo: sp.logo,
        url: sp.loginUrl,
      })),
    },
  });
  return c.json(response);
};

export const handleGetUsers = async (c: Context<AppType, string, QueryInput<typeof GetUsersRequestSchema>>) => {
  const { limit, offset, role } = c.req.valid("query");
  const result: GetPaginatedUsersResult = await getPaginatedUsers(c, { limit, offset, role });
  const response = GetUsersResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      users: result.users,
      total: result.total,
      limit,
      offset,
    },
  });
  return c.json(response);
}

export const handleGetUserById = async (c: Context<AppType>) => {
  const userId = c.req.param("id");
  const user = await getUserById(c, userId);
  if (!user) {
    throw "User not found";
  }
  const allowedServiceProviders = await getAllowedServiceProvidersForCompany(c, user.companyId);
  const enabledServiceProviders = await getAllowedServiceProvidersForUser(c, user.id);
  const response = GetUserResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      user,
      allowedServiceProviders: allowedServiceProviders,
      enabledServiceProviders: enabledServiceProviders,
    },
  });
  return c.json(response);
};

export const handleUpdateUser = async (c: Context<AppType, string, JsonInput<typeof UpdateUserRequestSchema>>) => {
  const userId = c.req.param("id");
  if (!userId) {
    throw "User ID is required";
  }
  const { role, enabledServiceProviderIds } = c.req.valid("json");
  const user = await getUserById(c, userId);
  if (!user) {
    throw "User not found";
  }
  const possibleServiceProviders = await getAllServiceProviders(c);
  const allowedServiceProviders = await getAllowedServiceProvidersForCompany(c, user.companyId);
  for (const spId of enabledServiceProviderIds || []) {
    if (!possibleServiceProviders.find(sp => sp.id === spId)) {
      throw `Service provider ID ${spId} is not valid`;
    }
    if (!allowedServiceProviders.find(asp => asp.id === spId)) {
      throw `Service provider ID ${spId} is not allowed for the user's company`;
    }
  }

  for (const sp of possibleServiceProviders) {
    const isEnabled = enabledServiceProviderIds?.includes(sp.id) ?? false;
    if (isEnabled) {
      // Enable the service provider for the user
      await allowUserServiceProvider(c, {
        userId: user.id,
        serviceProviderId: sp.id,
      });
    } else {
      // Disable the service provider for the user
      await revokeUserServiceProvider(c, {
        userId: user.id,
        serviceProviderId: sp.id,
      });
    }
  }

  const updatedUser = await updateUser(c, {
    id: user.id,
    role,
  });
  const updatedEnabledServiceProviders = await getAllowedServiceProvidersForUser(c, user.id);
  const response = UpdateUserResponseSchema.parse({
    success: true,
    message: "User updated successfully",
    data: {
      user: updatedUser,
      allowedServiceProviders: allowedServiceProviders,
      enabledServiceProviders: updatedEnabledServiceProviders,
    }
  });
  return c.json(response);
};