import { PrismaClient } from "@/database/models";
import { Context } from "hono";

export interface CreateUserServiceProviderInput {
  userId: string;
  serviceProviderId: string;
  enabled: boolean;
}

export interface RevokeUserServiceProviderInput {
  userId: string;
  serviceProviderId: string;
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

export const revokeUserServiceProvider = (c: Context, input: RevokeUserServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.userServiceProvider.updateMany({
    where: {
      userId: input.userId,
      serviceProviderId: input.serviceProviderId,
    },
    data: {
      enabled: false,
    },
  });
}