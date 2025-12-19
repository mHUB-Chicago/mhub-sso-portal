import { PrismaClient } from "@/database/models";
import { Context } from "hono";

export interface CreateCompanyInput {
  name: string;
  peopleVineId: string;
  active: boolean;
}

export const createCompany = (c: Context, input: CreateCompanyInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.company.create({
    data: {
      name: input.name,
      peopleVineId: input.peopleVineId,
      active: input.active,
    },
  });
}

export const getCompanyById = (c: Context, id: string) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.company.findUnique({
    where: { id },
  });
}