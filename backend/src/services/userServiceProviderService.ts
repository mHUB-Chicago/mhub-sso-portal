import { PrismaClient, ServiceProvider, UserServiceProvider } from "@/database/models";
import { Context } from "hono";
import { getUserById } from "./userService";
import { getAllowedServiceProvidersForCompany } from "./companyServiceProviderService";

export interface CreateUserServiceProviderInput {
  userId: string;
  serviceProviderId: string;
  enabled: boolean;
}

export interface AllowUserServiceProviderInput {
  userId: string;
  serviceProviderId: string;
}

export interface RevokeUserServiceProviderInput {
  userId: string;
  serviceProviderId: string;
}

export const getAllowedServiceProvidersForUser = async (c: Context, userId: string): Promise<ServiceProvider[]> => {
  const prisma: PrismaClient = c.get("db");
  const user = await getUserById(c, userId);
  if (!user) {
    throw new Error("User not found");
  }
  const allowedServiceProvidersByCompany = await getAllowedServiceProvidersForCompany(c, user.companyId);
  const revokedUserServiceProviders: UserServiceProvider[] = await prisma.userServiceProvider.findMany({
    where: {
      userId,
      enabled: false,
    },
  });
  const revokedServiceProviderIds = new Set(revokedUserServiceProviders.map(usp => usp.serviceProviderId));
  return allowedServiceProvidersByCompany.filter(sp => !revokedServiceProviderIds.has(sp.id));
}

export const getUserServiceProvider = (c: Context, userId: string, serviceProviderId: string): Promise<UserServiceProvider | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.userServiceProvider.findFirst({
    where: {
      userId,
      serviceProviderId,
      enabled: true,
    },
  });
}

export const createUserServiceProvider = (c: Context, input: CreateUserServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.userServiceProvider.create({
    data: {
      userId: input.userId,
      serviceProviderId: input.serviceProviderId,
      enabled: input.enabled,
    },
  });
}

export const allowUserServiceProvider = (c: Context, input: AllowUserServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.userServiceProvider.upsert({
    where: {
      userId_serviceProviderId: {
        userId: input.userId,
        serviceProviderId: input.serviceProviderId,
      },
    },
    update: {
      enabled: true,
    },
    create: {
      userId: input.userId,
      serviceProviderId: input.serviceProviderId,
      enabled: true,
    },
  });
}

export const revokeUserServiceProvider = (c: Context, input: RevokeUserServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.userServiceProvider.upsert({
    where: {
      userId_serviceProviderId: {
        userId: input.userId,
        serviceProviderId: input.serviceProviderId,
      },
    },
    update: {
      enabled: false,
    },
    create: {
      userId: input.userId,
      serviceProviderId: input.serviceProviderId,
      enabled: false,
    },
  });
}