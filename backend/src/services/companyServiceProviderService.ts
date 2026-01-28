import { CompanyServiceProvider, PrismaClient, ServiceProvider, UserServiceProvider } from "@/database/models";
import { Context } from "hono";
import { getAllServiceProviders } from "./serviceProviderService";

export interface CreateCompanyServiceProviderInput {
  companyId: string;
  serviceProviderId: string;
  enabled: boolean;
}

export interface AllowCompanyServiceProviderInput {
  companyId: string;
  serviceProviderId: string;
}

export interface RevokeCompanyServiceProviderInput {
  companyId: string;
  serviceProviderId: string;
}

export const getAllowedServiceProvidersForCompany = async (c: Context, companyId: string): Promise<ServiceProvider[]> => {
  const prisma: PrismaClient = c.get("db");
  const allServiceProviders: ServiceProvider[] = await getAllServiceProviders(c);
  const revokedCompanyServiceProviders: CompanyServiceProvider[] = await prisma.companyServiceProvider.findMany({
    where: {
      companyId,
      enabled: false,
    },
  });
  const revokedServiceProviderIds = new Set(revokedCompanyServiceProviders.map(csp => csp.serviceProviderId));
  return allServiceProviders.filter(sp => !revokedServiceProviderIds.has(sp.id));
}

export const getCompanyServiceProvider = (c: Context, companyId: string, serviceProviderId: string): Promise<CompanyServiceProvider | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.companyServiceProvider.findFirst({
    where: {
      companyId,
      serviceProviderId,
      enabled: true,
    },
  });
}

export const createCompanyServiceProvider = (c: Context, input: CreateCompanyServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.companyServiceProvider.create({
    data: {
      companyId: input.companyId,
      serviceProviderId: input.serviceProviderId,
      enabled: input.enabled,
    },
  });
}

export const allowCompanyServiceProvider = async (c: Context, input: AllowCompanyServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  await prisma.companyServiceProvider.upsert({
    where: {
      companyId_serviceProviderId: {
        companyId: input.companyId,
        serviceProviderId: input.serviceProviderId,
      },
    },
    update: {
      enabled: true,
    },
    create: {
      companyId: input.companyId,
      serviceProviderId: input.serviceProviderId,
      enabled: true,
    },
  });
}

export const revokeCompanyServiceProvider = (c: Context, input: RevokeCompanyServiceProviderInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.companyServiceProvider.upsert({
    where: {
      companyId_serviceProviderId: {
        companyId: input.companyId,
        serviceProviderId: input.serviceProviderId,
      },
    },
    update: {
      enabled: false,
    },
    create: {
      companyId: input.companyId,
      serviceProviderId: input.serviceProviderId,
      enabled: false,
    },
  });
}