import { Context } from "hono";
import { AppType } from "..";
import { GetMyUserResponseSchema } from "@common/schemas/user";
import { getUserServiceProvidersByUserId } from "@/services/userServiceProviderService";

export const handleGetMyUser = async (c: Context<AppType>) => {
  const user = c.get("user");
  const serviceProviders = await getUserServiceProvidersByUserId(c, user.id);
  const response = GetMyUserResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      user,
      apps: serviceProviders.map(app => ({
        name: app.serviceProvider.name,
        logo: app.serviceProvider.logo,
        url: app.serviceProvider.loginUrl,
      })),
    },
  });
  return c.json(response);
};