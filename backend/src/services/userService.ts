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
  primaryMembership?: string;
  active?: 'true' | 'false';
  emailVerified?: 'true' | 'false';
  portalAccess?: 'true' | 'false';
  noEmail?: 'true' | 'false';
  noName?: 'true' | 'false';
  noPrimary?: 'true' | 'false';
  directPersonal?: 'true' | 'false';
  unresolved?: 'true' | 'false';
  memberSource?: 'subscription' | 'membership';
  cmtOnly?: 'true' | 'false';
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
  primaryMembership?: string | null;
  addOns?: string[];
  profilePhoto?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cardStatus?: string | null;
  active?: boolean;
  memberSource?: string;
  memberSourceCompany?: string | null;
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
  primaryMembership?: string | null;
  addOns?: string[];
  profilePhoto?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cardStatus?: string | null;
  active?: boolean;
  memberSource?: string;
  memberSourceCompany?: string | null;
}

export const getPaginatedUsers = async (c: Context, input: GetPaginatedUsersInput): Promise<GetPaginatedUsersResult> => {
  const prisma: PrismaClient = c.get("db");

  if (input.noPrimary === 'true' || input.noPrimary === 'false') {
    const noPrimaryCondition = {
      AND: [
        { OR: [{ primaryMembership: null }, { primaryMembership: '' }] },
        { OR: [{ addOns: { not: '[]' } }, { company: { membershipTypes: { not: '[]' } } }] },
      ],
    };
    const whereClause: any = {
      ...(input.role && { role: input.role }),
      ...(input.companyId && { companyId: input.companyId }),
      ...(input.active !== undefined && { active: input.active === 'true' }),
      AND: [input.noPrimary === 'true' ? noPrimaryCondition : { NOT: noPrimaryCondition }],
    };
    const [rawUsers, total, subs] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip: input.offset,
        take: input.limit,
        orderBy: { createdAt: "desc" },
        include: { company: { select: { membershipTypes: true } } },
      }),
      prisma.user.count({ where: whereClause }),
      prisma.subscription.findMany({ select: { title: true, companyId: true } }),
    ]);
    const activeSubSet = new Set(subs.filter(s => s.companyId).map(s => `${s.companyId}::${s.title}`));
    const users = rawUsers.map(u => {
      const companyTypes: string[] = JSON.parse(u.company.membershipTypes || '[]');
      const addOns: string[] = JSON.parse(u.addOns || '[]');
      let membershipStatus: string;
      if (companyTypes.length > 0) {
        membershipStatus = 'Unresolved';
      } else if (addOns.length > 0) {
        membershipStatus = addOns.some(t => activeSubSet.has(`${u.companyId}::${t}`)) ? 'Unresolved' : 'Expired / Cancelled';
      } else {
        membershipStatus = 'No Membership';
      }
      const { company, ...rest } = u;
      return { ...rest, membershipStatus };
    });
    return { users, total };
  }

  const cmtNames = (await prisma.companyMembershipType.findMany({ select: { name: true } })).map(t => t.name);
  const portalTypeNames = (await prisma.portalAccessType.findMany({ select: { name: true } })).map(t => t.name);

  let membershipTypeFilter: any = undefined;
  let portalAccessCondition: any = undefined;
  if (input.primaryMembership) {
    membershipTypeFilter = input.primaryMembership;
  } else if (input.portalAccess !== undefined) {
    if (input.portalAccess === 'true') {
      portalAccessCondition = { OR: [
        { primaryMembership: { in: portalTypeNames } },
        ...portalTypeNames.map(name => ({ addOns: { contains: `"${name}"` } })),
      ]};
    } else {
      portalAccessCondition = { AND: [
        { OR: [{ primaryMembership: null }, { primaryMembership: { notIn: portalTypeNames } }] },
        ...portalTypeNames.map(name => ({ NOT: { addOns: { contains: `"${name}"` } } })),
      ]};
    }
  } else if (input.cmtOnly !== 'false') {
    const noRealPrimaryForCmt = { OR: [{ primaryMembership: null }, { primaryMembership: '' }] };
    portalAccessCondition = { OR: [
      { primaryMembership: { in: cmtNames } },
      { AND: [noRealPrimaryForCmt, { addOns: { not: '[]' } }] },
      { AND: [noRealPrimaryForCmt, { company: { membershipTypes: { not: '[]' } } }] },
    ]};
  }

  const PLACEHOLDER_SUFFIXES = ['@noemail.mhub', '@placeholder.invalid'];
  const placeholderFilter = PLACEHOLDER_SUFFIXES.map(s => ({ email: { contains: s } }));

  const whereClause: any = {
    ...(input.role && { role: input.role }),
    ...(input.companyId && { companyId: input.companyId }),
    ...(input.active !== undefined && { active: input.active === 'true' }),
    ...(input.emailVerified !== undefined && { emailVerified: input.emailVerified === 'true' }),
    ...(membershipTypeFilter !== undefined && { primaryMembership: membershipTypeFilter }),
    ...(input.memberSource && { memberSource: input.memberSource }),
  };

  const andConditions: any[] = [];
  if (portalAccessCondition) andConditions.push(portalAccessCondition);
  if (input.search) {
    andConditions.push({ OR: [
      { name: { contains: input.search } },
      { email: { contains: input.search } },
      { peopleVineId: { contains: input.search } },
      { username: { contains: input.search } },
    ]});
  }
  if (input.noEmail === 'true') {
    andConditions.push({ OR: placeholderFilter });
  } else if (input.noEmail === 'false') {
    andConditions.push({ NOT: { OR: placeholderFilter } });
  }
  if (input.noName === 'true') {
    andConditions.push({ name: '' });
  } else if (input.noName === 'false') {
    andConditions.push({ NOT: { name: '' } });
  }
  const noRealPrimary = { OR: [{ primaryMembership: null }, { primaryMembership: '' }] };
  const directPersonalCondition = { memberSource: 'subscription', company: { isPersonal: true } };
  if (input.directPersonal === 'true') {
    andConditions.push(directPersonalCondition);
  } else if (input.directPersonal === 'false') {
    andConditions.push({ NOT: { AND: [{ memberSource: directPersonalCondition.memberSource }, { company: directPersonalCondition.company }] } });
  }
  const unresolvedCondition = { AND: [noRealPrimary, { addOns: '[]' }, { company: { membershipTypes: '[]' } }] };
  if (input.unresolved === 'true') {
    andConditions.push(unresolvedCondition);
  } else if (input.unresolved === 'false') {
    andConditions.push({ NOT: unresolvedCondition });
  }
  if (andConditions.length > 0) whereClause.AND = andConditions;

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
  const { name, email, username, password, role, companyId, peopleVineId, mustResetPassword, emailVerified, primaryMembership, addOns, profilePhoto, phone, address, city, state, zipCode, cardStatus, active, memberSource, memberSourceCompany } = createUserInput;
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
      primaryMembership: primaryMembership ?? null,
      addOns: JSON.stringify(addOns ?? []),
      profilePhoto: profilePhoto ?? null,
      phone: phone ?? null,
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      zipCode: zipCode ?? null,
      cardStatus: cardStatus ?? null,
      active: active ?? true,
      memberSource: memberSource ?? 'subscription',
      memberSourceCompany: memberSourceCompany ?? null,
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
  const { id, name, email, username, password, role, companyId, peopleVineId, emailVerified, mustResetPassword, primaryMembership, addOns, profilePhoto, phone, address, city, state, zipCode, cardStatus, active, memberSource, memberSourceCompany } = updateUserInput;
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
      primaryMembership,
      ...(addOns !== undefined && { addOns: JSON.stringify(addOns) }),
      profilePhoto,
      phone,
      address,
      city,
      state,
      zipCode,
      cardStatus,
      active,
      memberSource,
      memberSourceCompany,
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
    where: { companyId, memberSource: { not: 'membership' } },
    data: { active: false },
  });
  console.log(`Deactivated ${count} users for company ID: ${companyId}`);
}