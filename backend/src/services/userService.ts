import { PrismaClient, Role, User } from "@prisma/client";
import { Context } from "hono";
import { getAllServiceProviders } from "./serviceProviderService";
import { createUserServiceProvider } from "./userServiceProviderService";

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  companyId: string;
  peopleVineId: string;
}

export const createUser = async (c: Context, createUserInput: CreateUserInput): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const { name, email, role, companyId, peopleVineId } = createUserInput;
  const normalizedEmail = email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }
  const createdUser = await prisma.user.create({
    data: {
      name,
      peopleVineId,
      companyId,
      role,
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