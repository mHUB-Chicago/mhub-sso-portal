import { PrismaClient, SamlSignTarget, ServiceProvider } from "@/database/models";
import { Context } from "hono";

export interface CreateServiceProviderInput {
  name: string;
  entityId: string;
  acsUrl: string;
  nameIdFormat?: string;
  nameIdSource: string;
  signTarget?: SamlSignTarget;
}

export const createServiceProvider = (c: Context, input: CreateServiceProviderInput): Promise<ServiceProvider> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.create({
    data: {
      name: input.name,
      entityId: input.entityId,
      acsUrl: input.acsUrl,
      nameIdFormat: input.nameIdFormat,
      nameIdSource: input.nameIdSource,
      signTarget: input.signTarget,
    },
  });
}

export const getServiceProviderById = (c: Context, id: string): Promise<ServiceProvider | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.findUnique({
    where: { id },
  });
}

export const getAllServiceProviders = (c: Context): Promise<ServiceProvider[]> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.serviceProvider.findMany();
}