import { hashPassword } from "@/utils/jwt";
import { PrismaClient, Role, User } from "@prisma/client";
import { Context } from "hono";

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  companyId: number;
  peopleVineId: string;
}

export const createUser = async (c: Context, createUserInput: CreateUserInput): Promise<User> => {
  const { name, email, role, companyId, peopleVineId } = createUserInput;
  const normalizedEmail = email.toLowerCase();
  const prisma: PrismaClient = c.get("db");
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
  return createdUser;
}

export const verifyLogin = async (c: Context, email: string, password: string): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) {
    throw new Error("User not found");
  }
  if (!password) {
    throw new Error("Password is required");
  }
  const hashedPassword = await hashPassword(password);
  const storedHashedPassword = user.password;
  if (!storedHashedPassword || storedHashedPassword !== hashedPassword) {
    throw new Error("Invalid password");
  }
  return user;
}

export const getUserById = async (c: Context, id: number): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.user.findUnique({
    where: { id },
  });
};

export const getUserByEmail = async (c: Context, email: string): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

export const deleteUser = async (c: Context, id: number): Promise<number | null> => {
  const prisma: PrismaClient = c.get("db");
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });
  if (!existingUser) {
    return null;
  }
  await prisma.user.delete({
    where: { id },
  });
  return id;
};

export const clearFailedLoginAttempts = async (c: Context, email: string): Promise<void> => {
  const prisma: PrismaClient = c.get("db");
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!existingUser) {
    throw new Error("User not found");
  }
  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: {
      lastLogin: new Date(),
      failedLoginAttempts: [],
    },
  });
};

export const logFailedLoginAttempt = async (c: Context, email: string): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (!existingUser) {
    throw new Error("User not found");
  }
  const noLockoutRoles: Role[] = [Role.ADMIN];
  const currentAttempts: Date[] = (existingUser?.failedLoginAttempts?.valueOf() as Date[]) ?? [];
  const updatedUser = await prisma.user.update({
    where: { email },
    data: {
      failedLoginAttempts: currentAttempts.concat([new Date()]),
      ...(currentAttempts.length > 5 && !noLockoutRoles.includes(existingUser.role as Role) ? { locked: true } : { locked: false }),
    },
  });
  return updatedUser;
};

export const verifyEmail = async (c: Context): Promise<void> => {
  const user = c.get("user");
  if (!user) {
    throw new Error("Unauthorized");
  }
  const prisma: PrismaClient = c.get("db");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
    },
  });
};

export const resetPassword = async (c: Context, userId: number, newPassword: string): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!existingUser) {
    throw new Error("User not found");
  }
  const hashedPassword = await hashPassword(newPassword);
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      mustResetPassword: false,
      locked: false,
      failedLoginAttempts: [],
    },
  });
  return updatedUser;
};