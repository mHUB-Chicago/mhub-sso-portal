import { PrismaClient } from "@/database/models";
import { Context } from "hono";
import { deleteUsersByCompanyId } from "./userService";

export interface CreateCompanyInput {
  name: string;
  peopleVineId: string;
  active: boolean;
}

export interface UpdateCompanyInput {
  id: string;
  name: string;
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

export const updateCompany = (c: Context, input: UpdateCompanyInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.company.update({
    where: { id: input.id },
    data: { name: input.name },
  });
}

export const deactivateCompany = async (c: Context, id: string) => {
  const prisma: PrismaClient = c.get("db");
  const deactivatedCompany = await prisma.company.update({
    where: { id },
    data: { active: false },
  });
  await deleteUsersByCompanyId(c, deactivatedCompany.id);
  return deactivatedCompany;
}

export const getCompanyById = (c: Context, id: string) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.company.findUnique({
    where: { id },
  });
}