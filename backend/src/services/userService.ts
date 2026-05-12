import { PrismaClient, Role, User } from "@prisma/client";
import { Context } from "hono";
import { getAllServiceProviders } from "./serviceProviderService";
import { createUserServiceProvider } from "./userServiceProviderService";
import { hashPassword } from "@/utils/jwt";

export interface GetPaginatedUsersInput {
  role?: Role;
  limit: number;
  offset: number;
  search?: string;
  companyId?: string;
}

export interface GetPaginatedUsersResult {
  users: User[];
  total: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  username?: string | null;
  password?: string;
  role: Role;
  companyId: string;
  peopleVineId: string;
  mustResetPassword?: boolean;
  emailVerified?: boolean;
  membershipType?: string | null;
  profilePhoto?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cardStatus?: string | null;
  active?: boolean;
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  email?: string;
  username?: string | null;
  password?: string;
  role?: Role;
  companyId?: string;
  peopleVineId?: string;
  emailVerified?: boolean;
  mustResetPassword?: boolean;
  membershipType?: string | null;
  profilePhoto?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cardStatus?: string | null;
  active?: boolean;
}

export const getPaginatedUsers = async (c: Context, input: GetPaginatedUsersInput): Promise<GetPaginatedUsersResult> => {
  const prisma: PrismaClient = c.get("db");
  const whereClause: any = {
    ...(input.role && { role: input.role }),
    ...(input.companyId && { companyId: input.companyId }),
    ...(input.search && {
      OR: [
        { name: { contains: input.search } },
        { email: { contains: input.search } },
      ],
    }),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      skip: input.offset,
      take: input.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where: whereClause }),
  ]);
  return { users, total };
}

export const getUserByEmail = (c: Context, email: string): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.user.findFirst({
    where: { email, active: true },
  });
}

export const getUserByUsername = (c: Context, username: string): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.user.findFirst({
    where: { username, active: true },
  });
}

export const getUserById = (c: Context, id: string): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.user.findUnique({
    where: { id },
  });
}

export const createUser = async (c: Context, createUserInput: CreateUserInput): Promise<User> => {
  const prisma: PrismaClient = c.get("db");
  const { name, email, username, password, role, companyId, peopleVineId, mustResetPassword, emailVerified, membershipType, profilePhoto, phone, address, city, state, zipCode, cardStatus, active } = createUserInput;
  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username ? username.trim().toLowerCase() : null;
  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, ...(normalizedUsername ? [{ username: normalizedUsername }] : [])] },
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
      passwordHashed: hashedPassword,
      email: normalizedEmail,
      username: normalizedUsername,
      mustResetPassword: mustResetPassword ?? true,
      emailVerified: emailVerified ?? false,
      membershipType: membershipType ?? null,
      profilePhoto: profilePhoto ?? null,
      phone: phone ?? null,
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zipCode: zipCode ?? null,
      cardStatus: cardStatus ?? null,
      active: active ?? true,
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
  const { id, name, email, username, password, role, companyId, peopleVineId, emailVerified, mustResetPassword, membershipType, profilePhoto, phone, address, city, state, zipCode, cardStatus, active } = updateUserInput;
  const hashedPassword = password ? await hashPassword(password) : undefined;

  return prisma.user.update({
    where: { id },
    data: {
      name: name ? name.trim() : undefined,
      email: email ? email.toLowerCase().trim() : undefined,
      username: username !== undefined ? (username ? username.trim().toLowerCase() : null) : undefined,
      passwordHashed: hashedPassword,
      role,
      companyId,
      peopleVineId,
      emailVerified,
      mustResetPassword,
      membershipType,
      profilePhoto,
      phone,
      address,
      city,
      state,
      zipCode,
      cardStatus,
      active,
    },
  });
}

export const deactivateUser = async (c: Context, id: string): Promise<void> => {
  const prisma: PrismaClient = c.get("db");
  await prisma.user.update({
    where: { id },
    data: { active: false },
  });
}

export const deactivateUsersByCompanyId = async (c: Context, companyId: string) => {
  const prisma: PrismaClient = c.get("db");
  const { count } = await prisma.user.updateMany({
    where: { companyId },
    data: { active: false },
  });
  console.log(`Deactivated ${count} users for company ID: ${companyId}`);
}