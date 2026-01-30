import { PrismaClient, SamlSignTarget, ServiceProvider } from "@/database/models";
import { Context } from "hono";

export interface CreateServiceProviderInput {
  name: string;
  entityId: string;
  acsUrl: string;
  logo: string;
  loginUrl: string;
  signTarget?: SamlSignTarget;
  autoRedirect?: boolean;
}

export interface UpdateServiceProviderInput {
  id: string;
  active?: boolean;
  name?: string;
  entityId?: string;
  acsUrl?: string;
  logo?: string;
  loginUrl?: string;
  signTarget?: SamlSignTarget;
  autoRedirect?: boolean;
}

export const createServiceProvider = (c: Context, input: CreateServiceProviderInput): Promise<ServiceProvider> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.create({
    data: {
      name: input.name,
      entityId: input.entityId,
      acsUrl: input.acsUrl,
      loginUrl: input.loginUrl,
      logo: input.logo,
      signTarget: input.signTarget,
      autoRedirect: input.autoRedirect,
    },
  });
}

export const getServiceProviderById = (c: Context, id: string): Promise<ServiceProvider | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.findUnique({
    where: { id },
  });
}

export const getServiceProviderByEntityId = (c: Context, entityId: string): Promise<ServiceProvider | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.findUnique({
    where: { entityId },
  });
}

export const getAllServiceProviders = (c: Context): Promise<ServiceProvider[]> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.findMany();
}

export const getAllActiveServiceProviders = (c: Context): Promise<ServiceProvider[]> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.findMany({
    where: { active: true },
  });
}

export const updateServiceProvider = (c: Context, input: UpdateServiceProviderInput): Promise<ServiceProvider> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.update({
    where: { id: input.id },
    data: {
      name: input.name,
      active: input.active,
      entityId: input.entityId,
      acsUrl: input.acsUrl,
      logo: input.logo,
      loginUrl: input.loginUrl,
      signTarget: input.signTarget,
      autoRedirect: input.autoRedirect,
    },
  });
}

export const deleteServiceProvider = (c: Context, id: string): Promise<void> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.delete({
    where: { id },
  }).then(() => {});
};