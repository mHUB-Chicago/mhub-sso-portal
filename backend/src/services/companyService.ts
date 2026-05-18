import { Company, Prisma, PrismaClient } from "@/database/models";
import { Context } from "hono";
import { deactivateUsersByCompanyId } from "./userService";
import { getAllServiceProviders } from "./serviceProviderService";
import { createCompanyServiceProvider } from "./companyServiceProviderService";

export interface GetPaginatedCompaniesInput {
  limit: number;
  offset: number;
  search?: string;
  membershipType?: string;
  active?: 'true' | 'false';
  noEmail?: 'true' | 'false';
  cmtOnly?: 'true' | 'false';
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
  membershipTypes?: string[];
  isPersonal?: boolean;
}

export interface UpdateCompanyInput {
  id: string;
  name?: string;
  active?: boolean;
  email?: string;
  membershipTypes?: string[];
  isPersonal?: boolean;
  peopleVineId?: string;
}

export const getPaginatedCompanies = async (c: Context, input: GetPaginatedCompaniesInput): Promise<GetPaginatedCompaniesResult> => {
  const prisma: PrismaClient = c.get("db");
  const PLACEHOLDER_SUFFIXES = ['@noemail.mhub', '@placeholder.invalid'];
  const placeholderFilter = PLACEHOLDER_SUFFIXES.map(s => ({ email: { contains: s } }));

  if (!input.membershipType && input.cmtOnly !== 'false') {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`EXISTS (SELECT 1 FROM json_each(c."membershipTypes") je WHERE je.value IN (SELECT name FROM "CompanyMembershipType"))`,
    ];
    if (input.active !== undefined) {
      conditions.push(Prisma.sql`c.active = ${input.active === 'true' ? 1 : 0}`);
    }
    if (input.search) {
      conditions.push(Prisma.sql`(c.name LIKE ${'%' + input.search + '%'} OR c.email LIKE ${'%' + input.search + '%'})`);
    }
    if (input.noEmail === 'true') {
      conditions.push(Prisma.sql`(c.email LIKE ${'%@noemail.mhub'} OR c.email LIKE ${'%@placeholder.invalid'})`);
    } else if (input.noEmail === 'false') {
      conditions.push(Prisma.sql`(c.email NOT LIKE ${'%@noemail.mhub'} AND c.email NOT LIKE ${'%@placeholder.invalid'})`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const [rawCompanies, countResult] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT c.* FROM "Company" c WHERE ${where} ORDER BY c."createdAt" DESC LIMIT ${input.limit} OFFSET ${input.offset}`,
      prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) as total FROM "Company" c WHERE ${where}`,
    ]);
    const companies = rawCompanies.map(c => ({ ...c, active: Boolean(c.active), isPersonal: Boolean(c.isPersonal) })) as Company[];
    return { companies, total: Number(countResult[0]?.total ?? 0) };
  }

  const whereClause: any = {
    ...(input.active !== undefined && { active: input.active === 'true' }),
  };
  const andConditions: any[] = [];

  if (input.membershipType) {
    whereClause.membershipTypes = { contains: `"${input.membershipType}"` };
  }
  if (input.search) {
    andConditions.push({ OR: [
      { name: { contains: input.search } },
      { email: { contains: input.search } },
    ]});
  }
  if (input.noEmail === 'true') {
    andConditions.push({ OR: placeholderFilter });
  } else if (input.noEmail === 'false') {
    andConditions.push({ NOT: { OR: placeholderFilter } });
  }
  if (andConditions.length > 0) whereClause.AND = andConditions;
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
      membershipTypes: JSON.stringify(input.membershipTypes ?? []),
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
      ...(input.email ? { email: input.email } : {}),
      ...(input.membershipTypes !== undefined ? { membershipTypes: JSON.stringify(input.membershipTypes) } : {}),
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
