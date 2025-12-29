import { PrismaClient, Role, User } from "@prisma/client";
import { Context } from "hono";
import { getAllServiceProviders } from "./serviceProviderService";
import { createUserServiceProvider } from "./userServiceProviderService";
import { hashPassword } from "@/utils/jwt";

export interface CreateUserInput {
  name: string;
  email: string;
  password?: string;
  role: Role;
  companyId: string;
  peopleVineId: string;
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  email?: string;
  password?: string;
  role?: Role;
  companyId?: string;
  peopleVineId?: string;
}

export const getUserByEmail = (c: Context, email: string): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.user.findUnique({
    where: { email },
  });
}

export const createUser = async (c: Context, createUserInput: CreateUserInput): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const { name, email, password, role, companyId, peopleVineId } = createUserInput;
  const normalizedEmail = email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }
  let hashedPassword = password ? await hashPassword(password) : undefined;
  const createdUser = await prisma.user.create({
    data: {
      name,
      peopleVineId,
      companyId,
      role,
      password: hashedPassword,
      email: normalizedEmail,
      mustResetPassword: true,
      emailVerified: false,
      locked: false,
    },
  });
  if (!createdUser) {
    throw new Error("Failed to create user");
  }
  const serviceProviders = await getAllServiceProviders(c);
  // Give the user access to all service providers by default
  await Promise.all(
    serviceProviders.map((sp) =>
      createUserServiceProvider(c, {
        userId: createdUser.id,
        serviceProviderId: sp.id,
        enabled: true,
      })
    )
  );
  return createdUser;
}

export const updateUser = async (c: Context, updateUserInput: UpdateUserInput): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const { id, name, email, password, role, companyId, peopleVineId } = updateUserInput;
  const hashedPassword = password ? await hashPassword(password) : undefined;

  return prisma.user.update({
    where: { id },
    data: {
      name: name ? name.trim() : undefined,
      email: email ? email.toLowerCase().trim() : undefined,
      password: hashedPassword,
      role,
      companyId,
      peopleVineId,
    },
  });
}

export const deleteUser = async (c: Context, id: string): Promise<void> => {
  const prisma: PrismaClient = c.get("db");
  await prisma.user.delete({
    where: { id },
  });
}

export const deleteUsersByCompanyId = async (c: Context, companyId: string) => {
  const prisma: PrismaClient = c.get("db");
  const { count } = await prisma.user.deleteMany({
    where: { companyId },
  });
  console.log(`Deleted ${count} users for company ID: ${companyId}`);
}