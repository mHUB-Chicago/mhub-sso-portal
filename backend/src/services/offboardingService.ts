import { Context } from "hono";
import { PrismaClient, Offboarding } from "@/database/models";

export type OffboardingMember = { userId: string; name: string; email: string; memberSource: string };

export const parseOffboardingMembers = (value: string): OffboardingMember[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getOffboardableCompanyMembers = async (prisma: PrismaClient, companyId: string): Promise<OffboardingMember[]> => {
  const users = await prisma.user.findMany({
    where: { companyId, role: "USER", isSystemAccount: false, offboardedAt: null },
    select: { id: true, name: true, email: true, memberSource: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ userId: u.id, name: u.name, email: u.email, memberSource: u.memberSource }));
};

const ID_CHUNK = 90;

export const chunkIds = (ids: string[]): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  return chunks;
};

// Turns off every app, blocks login through offboardedAt, and ends open sessions. The sync
// never touches app access or offboardedAt, so this holds until the record is reversed by hand.
export const removeUsersAccess = async (prisma: PrismaClient, userIds: string[], now: Date): Promise<void> => {
  if (userIds.length === 0) return;
  const serviceProviderIds = (await prisma.serviceProvider.findMany({ select: { id: true } })).map((sp) => sp.id);
  for (const userId of userIds) {
    await prisma.userServiceProvider.updateMany({ where: { userId }, data: { enabled: false } });
    const existing = new Set(
      (await prisma.userServiceProvider.findMany({ where: { userId }, select: { serviceProviderId: true } }))
        .map((row) => row.serviceProviderId)
    );
    const missing = serviceProviderIds.filter((id) => !existing.has(id));
    if (missing.length) {
      await prisma.userServiceProvider.createMany({
        data: missing.map((serviceProviderId) => ({ userId, serviceProviderId, enabled: false })),
      });
    }
  }
  for (const ids of chunkIds(userIds)) {
    await prisma.user.updateMany({ where: { id: { in: ids }, role: "USER" }, data: { offboardedAt: now } });
    await prisma.session.updateMany({ where: { userId: { in: ids }, revokedAt: null }, data: { revokedAt: now } });
  }
};

const openRecordFor = (prisma: PrismaClient, type: "company" | "user", id: string): Promise<Offboarding | null> =>
  prisma.offboarding.findFirst({
    where: { completedAt: null, type, ...(type === "company" ? { companyId: id } : { userId: id }) },
  });

export const findOpenOffboardingCoveringUser = async (
  prisma: PrismaClient,
  userId: string,
  companyId: string
): Promise<Offboarding | null> => {
  const own = await openRecordFor(prisma, "user", userId);
  if (own) return own;
  const companyRecord = await openRecordFor(prisma, "company", companyId);
  if (companyRecord && parseOffboardingMembers(companyRecord.members).some((m) => m.userId === userId)) {
    return companyRecord;
  }
  return null;
};

// Called where the sync or webhook relabels a record from "active" to "membership-removed".
// Ticks the PeopleVine step on an open offboarding, or opens a member-cancelled one so the
// portal access is not forgotten. Never throws, so it cannot break a sync.
export const recordMembershipRemoved = async (c: Context, type: "company" | "user", id: string): Promise<void> => {
  try {
    const prisma: PrismaClient = c.get("db");
    const now = new Date();
    if (type === "user") {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user || user.role !== "USER" || user.isSystemAccount) return;
      const covering = await findOpenOffboardingCoveringUser(prisma, user.id, user.companyId);
      if (covering) {
        if (covering.type === "user" && !covering.pvRemovedAt) {
          await prisma.offboarding.update({ where: { id: covering.id }, data: { pvRemovedAt: now } });
        }
        return;
      }
      if (user.offboardedAt) return;
      if (await openRecordFor(prisma, "company", user.companyId)) return;
      await prisma.offboarding.create({
        data: {
          type: "user",
          userId: user.id,
          companyId: user.companyId,
          name: user.name,
          email: user.email,
          peopleVineId: user.peopleVineId,
          via: "member",
          members: "[]",
          pvRemovedAt: now,
        },
      });
      return;
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company || company.isSystemAccount) return;
    const open = await openRecordFor(prisma, "company", company.id);
    if (open) {
      if (!open.pvRemovedAt) await prisma.offboarding.update({ where: { id: open.id }, data: { pvRemovedAt: now } });
      return;
    }
    if (company.offboardedAt) return;
    const members = await getOffboardableCompanyMembers(prisma, company.id);
    await prisma.offboarding.create({
      data: {
        type: "company",
        companyId: company.id,
        name: company.name,
        email: company.email,
        peopleVineId: company.peopleVineId,
        via: "member",
        members: JSON.stringify(members),
        pvRemovedAt: now,
      },
    });
  } catch (error) {
    console.error(`Failed to record membership removal for ${type} ${id}:`, error);
  }
};
