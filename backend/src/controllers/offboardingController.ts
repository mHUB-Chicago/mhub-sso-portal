import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { PrismaClient } from "@prisma/client";
import { AppType, JsonInput } from "..";
import { Offboarding } from "@/database/models";
import {
  GetCompanyOffboardingMembersResponseSchema,
  GetOffboardingsResponseSchema,
  OffboardCompanyRequestSchema,
  OffboardingRecordResponseSchema,
} from "@common/schemas/offboarding";
import {
  chunkIds,
  findOpenOffboardingCoveringUser,
  getOffboardableCompanyMembers,
  parseOffboardingMembers,
  removeUsersAccess,
} from "@/services/offboardingService";

const toRecordDTO = (row: Offboarding, names: Map<string, string>) => ({
  id: row.id,
  type: row.type as "company" | "user",
  companyId: row.companyId,
  userId: row.userId,
  name: row.name,
  email: row.email,
  peopleVineId: row.peopleVineId,
  via: row.via as "admin" | "member",
  members: parseOffboardingMembers(row.members),
  accessRemovedAt: row.accessRemovedAt,
  pvRemovedAt: row.pvRemovedAt,
  externalRemovedAt: row.externalRemovedAt,
  externalRemovedByName: row.externalRemovedBy ? names.get(row.externalRemovedBy) ?? null : null,
  completedAt: row.completedAt,
  completedByName: row.completedBy ? names.get(row.completedBy) ?? null : null,
  createdAt: row.createdAt,
});

const adminNames = async (prisma: PrismaClient, rows: Offboarding[]): Promise<Map<string, string>> => {
  const ids = [...new Set(rows.flatMap((r) => [r.completedBy, r.externalRemovedBy]).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const admins = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(admins.map((a) => [a.id, a.name]));
};

// Backup for removals the webhook or sync recorded through a path that does not call
// recordMembershipRemoved (e.g. users deactivated together with their company).
const detectPeopleVineRemovals = async (prisma: PrismaClient, rows: Offboarding[]): Promise<void> => {
  const pending = rows.filter((r) => !r.pvRemovedAt);
  if (pending.length === 0) return;
  const userIds = pending.filter((r) => r.type === "user" && r.userId).map((r) => r.userId!);
  const companyIds = pending.filter((r) => r.type === "company" && r.companyId).map((r) => r.companyId!);
  const removedUsers = new Set<string>();
  const removedCompanies = new Set<string>();
  for (const ids of chunkIds(userIds)) {
    const users = await prisma.user.findMany({ where: { id: { in: ids }, accountStatus: "membership-removed" }, select: { id: true } });
    users.forEach((u) => removedUsers.add(u.id));
  }
  for (const ids of chunkIds(companyIds)) {
    const companies = await prisma.company.findMany({ where: { id: { in: ids }, accountStatus: "membership-removed" }, select: { id: true } });
    companies.forEach((co) => removedCompanies.add(co.id));
  }
  const now = new Date();
  for (const row of pending) {
    const removed = row.type === "user" ? removedUsers.has(row.userId ?? "") : removedCompanies.has(row.companyId ?? "");
    if (!removed) continue;
    await prisma.offboarding.update({ where: { id: row.id }, data: { pvRemovedAt: now } });
    row.pvRemovedAt = now;
  }
};

export const handleGetOffboardings = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const [inProcess, completed] = await Promise.all([
    prisma.offboarding.findMany({ where: { completedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.offboarding.findMany({ where: { completedAt: { not: null } }, orderBy: { completedAt: "desc" }, take: 500 }),
  ]);
  await detectPeopleVineRemovals(prisma, inProcess);
  const names = await adminNames(prisma, [...inProcess, ...completed]);

  const response = GetOffboardingsResponseSchema.parse({
    success: true,
    message: "Success",
    data: {
      inProcess: inProcess.map((r) => toRecordDTO(r, names)),
      completed: completed.map((r) => toRecordDTO(r, names)),
    },
  });
  return c.json(response);
};

export const handleGetCompanyOffboardingMembers = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const companyId = c.req.param("id");
  if (!companyId) throw new HTTPException(400, { message: "Company is required" });
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new HTTPException(404, { message: "Company not found" });

  const response = GetCompanyOffboardingMembersResponseSchema.parse({
    success: true,
    message: "Success",
    data: { members: await getOffboardableCompanyMembers(prisma, companyId) },
  });
  return c.json(response);
};

const respondWithRecord = async (c: Context<AppType>, prisma: PrismaClient, row: Offboarding, message: string) => {
  const names = await adminNames(prisma, [row]);
  const response = OffboardingRecordResponseSchema.parse({
    success: true,
    message,
    data: { record: toRecordDTO(row, names) },
  });
  return c.json(response);
};

export const handleOffboardUser = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const admin = c.get("user");
  const userId = c.req.param("id");
  if (!userId) throw new HTTPException(400, { message: "User is required" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HTTPException(404, { message: "User not found" });
  if (user.role !== "USER") throw new HTTPException(400, { message: "Admins cannot be offboarded" });
  if (user.offboardedAt) throw new HTTPException(400, { message: "This user has already been offboarded" });

  const now = new Date();
  await removeUsersAccess(prisma, [user.id], now);

  const existing = await findOpenOffboardingCoveringUser(prisma, user.id, user.companyId);
  if (existing?.type === "user") {
    const updated = await prisma.offboarding.update({
      where: { id: existing.id },
      data: { accessRemovedAt: now, accessRemovedBy: admin?.id ?? null },
    });
    return respondWithRecord(c, prisma, updated, `SSO access removed for ${user.name}.`);
  }

  const created = await prisma.offboarding.create({
    data: {
      type: "user",
      userId: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      peopleVineId: user.peopleVineId,
      via: "admin",
      members: "[]",
      createdBy: admin?.id ?? null,
      accessRemovedAt: now,
      accessRemovedBy: admin?.id ?? null,
      pvRemovedAt: user.accountStatus === "membership-removed" ? now : null,
    },
  });
  return respondWithRecord(c, prisma, created, `SSO access removed. ${user.name} added to Offboarding.`);
};

export const handleOffboardCompany = async (
  c: Context<AppType, string, JsonInput<typeof OffboardCompanyRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const admin = c.get("user");
  const companyId = c.req.param("id");
  if (!companyId) throw new HTTPException(400, { message: "Company is required" });
  const { userIds } = c.req.valid("json");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new HTTPException(404, { message: "Company not found" });
  if (company.offboardedAt) throw new HTTPException(400, { message: "This company has already been offboarded" });
  const existing = await prisma.offboarding.findFirst({ where: { completedAt: null, type: "company", companyId } });
  if (existing?.accessRemovedAt) throw new HTTPException(400, { message: "This company is already being offboarded" });

  const selected = new Set(userIds);
  const members = (await getOffboardableCompanyMembers(prisma, companyId)).filter((m) => selected.has(m.userId));
  if (members.length !== selected.size) {
    throw new HTTPException(400, { message: "Some selected members do not belong to this company or are already offboarded" });
  }

  const now = new Date();
  await removeUsersAccess(prisma, members.map((m) => m.userId), now);
  await prisma.company.update({ where: { id: companyId }, data: { offboardedAt: now } });

  const data = {
    members: JSON.stringify(members),
    accessRemovedAt: now,
    accessRemovedBy: admin?.id ?? null,
  };
  const record = existing
    ? await prisma.offboarding.update({ where: { id: existing.id }, data })
    : await prisma.offboarding.create({
        data: {
          ...data,
          type: "company",
          companyId,
          name: company.name,
          email: company.email,
          peopleVineId: company.peopleVineId,
          via: "admin",
          createdBy: admin?.id ?? null,
          pvRemovedAt: company.accountStatus === "membership-removed" ? now : null,
        },
      });
  const memberCount = `${members.length} member${members.length === 1 ? "" : "s"}`;
  return respondWithRecord(c, prisma, record, `SSO access removed for ${company.name} and ${memberCount}.`);
};

const findOpenRecord = async (prisma: PrismaClient, id: string | undefined) => {
  if (!id) throw new HTTPException(400, { message: "Offboarding record is required" });
  const row = await prisma.offboarding.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: "Offboarding record not found" });
  if (row.completedAt) throw new HTTPException(400, { message: "This offboarding is already complete" });
  return row;
};

// For member-cancelled records, where PeopleVine was handled first and portal access is still on.
export const handleRemoveOffboardingAccess = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const admin = c.get("user");
  const row = await findOpenRecord(prisma, c.req.param("id"));
  if (row.accessRemovedAt) throw new HTTPException(400, { message: "SSO access has already been removed" });

  const now = new Date();
  if (row.type === "user") {
    if (!row.userId) throw new HTTPException(400, { message: "This record has no linked user" });
    await removeUsersAccess(prisma, [row.userId], now);
  } else {
    const listed = parseOffboardingMembers(row.members).map((m) => m.userId);
    const stillLinked = row.companyId
      ? (await getOffboardableCompanyMembers(prisma, row.companyId)).map((m) => m.userId)
      : [];
    await removeUsersAccess(prisma, [...new Set([...listed, ...stillLinked])], now);
    if (row.companyId) await prisma.company.update({ where: { id: row.companyId }, data: { offboardedAt: now } });
  }

  const updated = await prisma.offboarding.update({
    where: { id: row.id },
    data: { accessRemovedAt: now, accessRemovedBy: admin?.id ?? null },
  });
  return respondWithRecord(c, prisma, updated, `SSO access removed for ${row.name}.`);
};

export const handleMarkExternalAccountsRemoved = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const admin = c.get("user");
  const row = await findOpenRecord(prisma, c.req.param("id"));
  if (row.externalRemovedAt) {
    throw new HTTPException(400, { message: "The external accounts are already marked as removed" });
  }

  const updated = await prisma.offboarding.update({
    where: { id: row.id },
    data: { externalRemovedAt: new Date(), externalRemovedBy: admin?.id ?? null },
  });
  return respondWithRecord(c, prisma, updated, `External accounts marked as removed for ${row.name}.`);
};

export const handleCompleteOffboarding = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const admin = c.get("user");
  const row = await findOpenRecord(prisma, c.req.param("id"));
  if (!row.accessRemovedAt || !row.pvRemovedAt || !row.externalRemovedAt) {
    throw new HTTPException(400, {
      message: "SSO access, the PeopleVine membership and the LearnWorlds, Shop site and DigiFabster accounts must all be removed first",
    });
  }

  const updated = await prisma.offboarding.update({
    where: { id: row.id },
    data: { completedAt: new Date(), completedBy: admin?.id ?? null },
  });
  return respondWithRecord(c, prisma, updated, `${row.name} moved to Completed.`);
};
