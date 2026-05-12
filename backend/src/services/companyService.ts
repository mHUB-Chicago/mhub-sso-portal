import { Company, PrismaClient } from "@/database/models";
import { Context } from "hono";
import { deactivateUsersByCompanyId } from "./userService";
import { getAllServiceProviders } from "./serviceProviderService";
import { createCompanyServiceProvider } from "./companyServiceProviderService";

export interface GetPaginatedCompaniesInput {
  limit: number;
  offset: number;
  search?: string;
}

export interface GetPaginatedCompaniesResult {
  companies: Company[];
  total: number;
}

export interface CreateCompanyInput {
  name: string;
  peopleVineId: string | null;
  active: boolean;
  email: string;
  membershipType?: string | null;
  isPersonal?: boolean;
}

export interface UpdateCompanyInput {
  id: string;
  name?: string;
  active?: boolean;
  email?: string;
  membershipType?: string | null;
  isPersonal?: boolean;
  peopleVineId?: string;
}

export const getPaginatedCompanies = async (c: Context, input: GetPaginatedCompaniesInput): Promise<GetPaginatedCompaniesResult> => {
  const prisma: PrismaClient = c.get("db");
  const whereClause: any = input.search ? {
    OR: [
      { name: { contains: input.search } },
      { email: { contains: input.search } },
    ],
  } : {};
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where: whereClause,
      skip: input.offset,
      take: input.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.count({ where: whereClause }),
  ]);
  return { companies, total };
}

export const createCompany = async (c: Context, input: CreateCompanyInput) => {
  const prisma: PrismaClient = c.get("db");
  const createdCompany = await prisma.company.create({
    data: {
      name: input.name,
      peopleVineId: input.peopleVineId,
      active: input.active,
      email: input.email,
      membershipType: input.membershipType ?? null,
      isPersonal: input.isPersonal ?? false,
    },
  });
  const serviceProviders = await getAllServiceProviders(c);
  for (const sp of serviceProviders) {
    await createCompanyServiceProvider(c, {
      companyId: createdCompany.id,
      serviceProviderId: sp.id,
      enabled: true,
    });
  }
  return createdCompany;
}

export const updateCompany = async (c: Context, input: UpdateCompanyInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.company.update({
    where: { id: input.id },
    data: {
      name: input.name,
      active: input.active,
      membershipType: input.membershipType,
      isPersonal: input.isPersonal,
      ...(input.peopleVineId ? { peopleVineId: input.peopleVineId } : {}),
    },
  });
}

export const deactivateCompany = async (c: Context, id: string) => {
  const prisma: PrismaClient = c.get("db");
  const deactivatedCompany = await prisma.company.update({
    where: { id },
    data: { active: false },
  });
  await deactivateUsersByCompanyId(c, deactivatedCompany.id);
  return deactivatedCompany;
}

export const getCompanyById = async (c: Context, id: string) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.company.findUnique({
    where: { id },
  });
}
