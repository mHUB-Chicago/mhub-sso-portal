import { Hono } from "hono";
import { z, ZodType } from "zod";
import { PrismaClient, User } from "@prisma/client";
import { authMiddleware } from "@/middleware/auth";
import { corsMiddleware } from "@/middleware/cors";
import { databaseMiddleware } from "@/middleware/database";
import { handleError } from "@/utils/handleError";
import loginRoutes from "@/routes/login";
import userRoutes from "@/routes/user";
import companyRoutes from "@/routes/company";
import onboardingRoutes from "@/routes/onboarding";
import publicOnboardingRoutes from "@/routes/publicOnboarding";
import serviceProviderRoutes from "@/routes/serviceProvider";
import samlRoutes from "@/routes/saml";
// import seedRoute from "@/database/seed";
import webhookRoutes from "@/routes/webhook";
import queueConsumer, { JobType } from "./controllers/queueConsumer";
import scheduledHandler from "./controllers/scheduledHandler";
import { markPublic } from "./middleware/markPublic";
import { Role } from "@prisma/client";
import { fetchAllPvData, fetchPvPage, readAuditChunks, fetchAllMembershipCards } from "@/services/peopleVineService";


type Bindings = {
  DB: D1Database;
  QUEUE: Queue<{ jobId: string; jobType: JobType; payload: unknown }>;
  [key: string]: string | D1Database | Queue<any>;
};
type Variables = {
  user: User;
  db: PrismaClient;
  skipAuth?: boolean;
};
type JsonInputSchema<T extends ZodType> = {
  in: { json: z.input<T> };
  out: { json: z.infer<T> };
};
type QueryInputSchema<T extends ZodType> = {
  in: { query: z.input<T> };
  out: { query: z.infer<T> };
};
export type AppType = {
  Bindings: Bindings;
  Variables: Variables;
};
export type JsonInput<T extends ZodType> = JsonInputSchema<T>;
export type QueryInput<T extends ZodType> = QueryInputSchema<T>;
const app = new Hono<AppType>();
app.onError(handleError);
app.use("*", async (c, next) => {
  try {
    return await next();
  } catch (err) {
    return handleError(err, c);
  }
});

// Public routes
app.use("/api/login/start", markPublic);
app.use("/api/login/verify", markPublic);
app.use("/api/login/forgot-password", markPublic);
app.use("/api/public-onboarding/*", markPublic);

app.use("/api/*", corsMiddleware, databaseMiddleware, authMiddleware);
app.route("/api/login", loginRoutes);
app.route("/api/user", userRoutes);
app.route("/api/company", companyRoutes);
app.route("/api/onboarding", onboardingRoutes);
app.route("/api/public-onboarding", publicOnboardingRoutes);
app.route("/api/provider", serviceProviderRoutes);

app.use("/webhook/*", corsMiddleware, databaseMiddleware);
app.route("/webhook", webhookRoutes);

app.use("/saml/*", corsMiddleware, databaseMiddleware);
app.route("/saml", samlRoutes);

app.use("/__internal/*", databaseMiddleware);

// app.route("/__internal/seed", seedRoute);

app.get("/api/sync/status", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const session = await prisma.syncSession.findFirst({ orderBy: { startedAt: 'desc' } });
  return c.json({ success: true, data: session ? { ...session, logs: JSON.parse(session.logs) } : null });
});

app.post("/api/sync/start", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { type, includeFreeMembers = true } = await c.req.json<{ type: 'ALL' | 'CONTINUE'; includeFreeMembers?: boolean }>();
  const prisma = c.get('db');
  const activeSession = await prisma.syncSession.findFirst({
    where: { status: { in: ['running', 'pending'] }, type: { in: ['ALL', 'CONTINUE', 'FILTERED'] } },
  });
  if (activeSession) {
    return c.json({ success: false, error: 'A sync is already in progress.', data: { sessionId: activeSession.id } }, 409);
  }
  const session = await prisma.syncSession.create({
    data: {
      type,
      status: 'pending',
      step: 'Queued',
      logs: JSON.stringify([{ time: new Date().toISOString(), level: 'info', message: 'Sync queued' }]),
      metadata: JSON.stringify({ includeFreeMembers }),
    },
  });
  // V2 pipeline (SYNC_V2_EXTRACT_PVDATA) is still under validation — route all "Sync All" runs
  // through v1 (SYNC_PEOPLEVINE_EVERYTHING, which itself branches on `type` for ALL vs CONTINUE)
  // until v2 has more production confidence.
  await c.env.QUEUE.send({
    jobId: session.id,
    jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
    payload: { sessionId: session.id, type },
  });
  return c.json({ success: true, data: { sessionId: session.id } });
});

app.post("/api/sync/cancel", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const session = await prisma.syncSession.findFirst({
    where: { status: { in: ['pending', 'running'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (!session) return c.json({ success: false, error: 'No active sync to cancel' }, 404);
  const existingLogs = JSON.parse(session.logs ?? '[]');
  existingLogs.push({ time: new Date().toISOString(), level: 'warn', message: 'Sync forcefully cancelled by admin.' });
  await prisma.syncSession.update({
    where: { id: session.id },
    data: { status: 'cancelled', step: 'Cancelled', completedAt: new Date(), logs: JSON.stringify(existingLogs) },
  });
  return c.json({ success: true });
});

app.get("/api/webhook/logs", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);
  const eventType = c.req.query('eventType') || undefined;
  const dateFrom = c.req.query('dateFrom') ? new Date(c.req.query('dateFrom')!) : undefined;
  const dateTo = c.req.query('dateTo') ? new Date(c.req.query('dateTo')!) : undefined;
  const where = {
    ...(eventType && { eventType }),
    ...((dateFrom || dateTo) && {
      receivedAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    }),
  };
  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({ where, orderBy: { receivedAt: 'desc' }, take: limit, skip: offset }),
    prisma.webhookLog.count({ where }),
  ]);
  return c.json({ success: true, data: { logs, total, limit, offset } });
});

app.get("/api/sync/fresh/stats", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db') as PrismaClient;
  const adminUsers = await prisma.user.findMany({ where: { role: Role.ADMIN }, select: { companyId: true } });
  const adminCompanyIds = adminUsers.map(u => u.companyId).filter(Boolean) as string[];
  const [companies, users] = await Promise.all([
    prisma.company.count({ where: adminCompanyIds.length > 0 ? { id: { notIn: adminCompanyIds } } : {} }),
    prisma.user.count({ where: { role: Role.USER } }),
  ]);
  return c.json({ success: true, data: { companies, users } });
});

app.post("/api/sync/fresh", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db') as PrismaClient;

  const adminUsers = await prisma.user.findMany({ where: { role: Role.ADMIN }, select: { companyId: true } });
  const adminCompanyIds = adminUsers.map(u => u.companyId).filter(Boolean) as string[];

  const [deletedUsers, deletedCompanies] = await Promise.all([
    prisma.user.deleteMany({ where: { role: Role.USER } }),
    prisma.company.deleteMany({
      where: adminCompanyIds.length > 0 ? { id: { notIn: adminCompanyIds } } : {},
    }),
  ]);

  return c.json({ success: true, data: { usersDeleted: deletedUsers.count, companiesDeleted: deletedCompanies.count } });
});

app.post("/api/sync/import-filtered", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { companies, members } = await c.req.json<{
    companies: { subscriptionNo: string; companyName: string; primaryMembership: string | null }[];
    members: { customerNo: string; email: string; firstName: string; lastName: string; companyName: string; username: string | null }[];
  }>();
  const prisma = c.get('db');
  const session = await prisma.syncSession.create({
    data: {
      type: 'FILTERED',
      status: 'pending',
      step: 'Queued',
      logs: JSON.stringify([{ time: new Date().toISOString(), level: 'info', message: 'Filtered import queued' }]),
      metadata: JSON.stringify({ companies, members }),
    },
  });
  await c.env.QUEUE.send({
    jobId: session.id,
    jobType: JobType.SYNC_FILTERED,
    payload: { sessionId: session.id },
  });
  return c.json({ success: true, data: { sessionId: session.id } });
});

app.get("/api/sync/history", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);
  const [sessions, total] = await Promise.all([
    prisma.syncSession.findMany({ orderBy: { startedAt: 'desc' }, take: limit, skip: offset }),
    prisma.syncSession.count(),
  ]);
  return c.json({
    success: true,
    data: {
      sessions: sessions.map(s => ({ ...s, logs: JSON.parse(s.logs) })),
      total,
      limit,
      offset,
    },
  });
});

app.get("/api/sync/raw-export", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);

  const { subscriptions } = await fetchAllPvData(c);
  const { cards: membershipCards } = await fetchAllMembershipCards(c, null);

  const filename = `pv-raw-${new Date().toISOString().slice(0, 10)}.json`;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const w = async (s: string) => writer.write(enc.encode(s));

  (async () => {
    try {
      await w(`{\n"fetchedAt":"${new Date().toISOString()}",\n"subscriptions":[\n`);
      let firstSub = true;
      for (const sub of subscriptions) {
        if (!firstSub) await w(',\n');
        await w('  ' + JSON.stringify(sub));
        firstSub = false;
      }

      await w(`\n],\n"membershipCards":[\n`);
      let firstCard = true;
      for (const card of membershipCards) {
        if (!firstCard) await w(',\n');
        await w('  ' + JSON.stringify(card));
        firstCard = false;
      }

      await w(`\n],\n"customers":[\n`);
      let page = 1;
      let firstCust = true;
      while (page <= 500) {
        const result = await fetchPvPage(c, '/customers', page);
        if (result && result.length > 0) {
          for (const item of result) {
            if (!firstCust) await w(',\n');
            await w('  ' + JSON.stringify(item));
            firstCust = false;
          }
        }
        if (!result || result.length < 100) break;
        page++;
      }
      await w(`\n]}`);
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

app.get("/api/sync/pv-subscriptions", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { subscriptions, skippedSubPages } = await fetchAllPvData(c);
  return c.json({ success: true, data: { subscriptions, skippedSubPages } });
});



app.get("/api/sync/sessions/:id/audit", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const sessionId = c.req.param('id');
  const prisma = c.get('db');
  const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
  if (!session) return c.json({ success: false, error: 'Session not found' }, 404);

  type AuditChange = { field: string; before: string; after: string };
  const companiesCreated: { id: string; name: string; pvId: string }[] = await readAuditChunks(prisma, sessionId, 'companiesCreated');
  const companiesUpdated: { id: string; name: string; pvId: string; changes: AuditChange[] }[] = await readAuditChunks(prisma, sessionId, 'companiesUpdated');
  const companiesDeactivated: { id: string; name: string }[] = await readAuditChunks(prisma, sessionId, 'companiesDeactivated');
  const usersCreated: { id: string; name: string; email: string; companyId: string }[] = await readAuditChunks(prisma, sessionId, 'usersCreated');
  const usersUpdated: { id: string; name: string; email: string; companyId: string; changes: AuditChange[] }[] = await readAuditChunks(prisma, sessionId, 'usersUpdated');
  const usersDeactivated: { id: string; name: string; email: string }[] = await readAuditChunks(prisma, sessionId, 'usersDeactivated');
  const correctionsCompanies: { id: string; name: string; pvId: string; changes: AuditChange[] }[] = await readAuditChunks(prisma, sessionId, 'correctionsCompanies');
  const correctionsUsers: { id: string; name: string; email: string; companyId: string; changes: AuditChange[] }[] = await readAuditChunks(prisma, sessionId, 'correctionsUsers');
  const membershipTypeMismatches: { id: string; name: string; email: string; pvId: string; primaryMembership: string | null; addOns: string[]; primaryCardFlagTitle: string | null; unmatchedCardTypes: string[] }[] = await readAuditChunks(prisma, sessionId, 'membershipTypeMismatches');
  const secondaryMemberships: { id: string; name: string; email: string; pvId: string; ownCompanyName: string; providingCompanyName: string; cardTitles: string[] }[] = await readAuditChunks(prisma, sessionId, 'secondaryMemberships');
  const notOnboarded: { id: string; name: string; email: string; pvId: string; companyName: string; active: boolean; primaryMembership: string | null }[] = await readAuditChunks(prisma, sessionId, 'notOnboarded');
  const noPrimaryFlagged: { id: string; name: string; email: string; pvId: string; companyName: string; active: boolean; addOns: string[]; candidateTypes: string[] }[] = await readAuditChunks(prisma, sessionId, 'noPrimaryFlagged');

  const startedAt = session.startedAt ? new Date(session.startedAt).toISOString() : 'N/A';
  const completedAt = session.completedAt ? new Date(session.completedAt).toISOString() : 'N/A';

  const esc = (v: string | null | undefined) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [];
  lines.push('Sync Audit Report');
  lines.push(`Session ID,${esc(sessionId)}`);
  lines.push(`Type,${session.type}`);
  lines.push(`Status,${session.status}`);
  lines.push(`Started,${startedAt}`);
  lines.push(`Completed,${completedAt}`);
  lines.push('');

  lines.push(`Companies Created (${companiesCreated.length})`);
  lines.push('ID,Name,PeopleVine ID');
  for (const r of companiesCreated) lines.push([esc(r.id), esc(r.name), esc(r.pvId)].join(','));
  lines.push('');

  lines.push(`Companies Updated (${companiesUpdated.length})`);
  lines.push('ID,Name,PeopleVine ID,Changes');
  for (const r of companiesUpdated) {
    const changesStr = (r.changes ?? []).map(ch => `${ch.field}: "${ch.before}" → "${ch.after}"`).join(' | ');
    lines.push([esc(r.id), esc(r.name), esc(r.pvId), esc(changesStr)].join(','));
  }
  lines.push('');

  lines.push(`Companies Deactivated (${companiesDeactivated.length})`);
  lines.push('ID,Name');
  for (const r of companiesDeactivated) lines.push([esc(r.id), esc(r.name)].join(','));
  lines.push('');

  lines.push(`Users Created (${usersCreated.length})`);
  lines.push('ID,Name,Email,Company ID');
  for (const r of usersCreated) lines.push([esc(r.id), esc(r.name), esc(r.email), esc(r.companyId)].join(','));
  lines.push('');

  lines.push(`Users Updated (${usersUpdated.length})`);
  lines.push('ID,Name,Email,Company ID,Changes');
  for (const r of usersUpdated) {
    const changesStr = (r.changes ?? []).map(ch => `${ch.field}: "${ch.before}" → "${ch.after}"`).join(' | ');
    lines.push([esc(r.id), esc(r.name), esc(r.email), esc(r.companyId), esc(changesStr)].join(','));
  }
  lines.push('');

  lines.push(`Users Deactivated (${usersDeactivated.length})`);
  lines.push('ID,Name,Email');
  for (const r of usersDeactivated) lines.push([esc(r.id), esc(r.name), esc(r.email)].join(','));
  lines.push('');

  lines.push(`Companies Corrected (Verification Pass) (${correctionsCompanies.length})`);
  lines.push('ID,Name,PeopleVine ID,Changes');
  for (const r of correctionsCompanies) {
    const changesStr = (r.changes ?? []).map(ch => `${ch.field}: "${ch.before}" → "${ch.after}"`).join(' | ');
    lines.push([esc(r.id), esc(r.name), esc(r.pvId), esc(changesStr)].join(','));
  }
  lines.push('');

  lines.push(`Users Corrected (Verification Pass) (${correctionsUsers.length})`);
  lines.push('ID,Name,Email,Company ID,Changes');
  for (const r of correctionsUsers) {
    const changesStr = (r.changes ?? []).map(ch => `${ch.field}: "${ch.before}" → "${ch.after}"`).join(' | ');
    lines.push([esc(r.id), esc(r.name), esc(r.email), esc(r.companyId), esc(changesStr)].join(','));
  }
  lines.push('');

  lines.push(`Membership Type Mismatches (${membershipTypeMismatches.length})`);
  lines.push('ID,Name,Email,PeopleVine ID,Primary Membership,Add-Ons,PV primary:true Card,Unmatched Card Types');
  for (const r of membershipTypeMismatches) {
    lines.push([
      esc(r.id), esc(r.name), esc(r.email), esc(r.pvId),
      esc(r.primaryMembership), esc((r.addOns ?? []).join('; ')),
      esc(r.primaryCardFlagTitle), esc((r.unmatchedCardTypes ?? []).join('; ')),
    ].join(','));
  }
  lines.push('');

  lines.push(`Secondary Memberships - Cross-Company Cards (${secondaryMemberships.length})`);
  lines.push('ID,Name,Email,PeopleVine ID,Own Company,Providing Company,Card Titles');
  for (const r of secondaryMemberships) {
    lines.push([
      esc(r.id), esc(r.name), esc(r.email), esc(r.pvId),
      esc(r.ownCompanyName), esc(r.providingCompanyName), esc((r.cardTitles ?? []).join('; ')),
    ].join(','));
  }
  lines.push('');

  lines.push(`Not Yet Onboarded - No Membership Card or Subscription (${notOnboarded.length})`);
  lines.push('ID,Name,Email,PeopleVine ID,Company,Active,Primary Membership');
  for (const r of notOnboarded) {
    lines.push([
      esc(r.id), esc(r.name), esc(r.email), esc(r.pvId),
      esc(r.companyName), esc(String(r.active)), esc(r.primaryMembership),
    ].join(','));
  }
  lines.push('');

  lines.push(`No Primary Membership Flagged (${noPrimaryFlagged.length})`);
  lines.push('ID,Name,Email,PeopleVine ID,Company,Active,Add-Ons,Candidate Types');
  for (const r of noPrimaryFlagged) {
    lines.push([
      esc(r.id), esc(r.name), esc(r.email), esc(r.pvId),
      esc(r.companyName), esc(String(r.active)), esc((r.addOns ?? []).join('; ')), esc((r.candidateTypes ?? []).join('; ')),
    ].join(','));
  }

  const dateSlug = startedAt !== 'N/A' ? startedAt.slice(0, 10) : 'unknown';
  const filename = `sync-audit-${dateSlug}-${sessionId.slice(0, 8)}.csv`;
  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

app.get("/api/sync/sessions/:id/audit/summary", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const sessionId = c.req.param('id');
  const prisma = c.get('db');
  const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
  if (!session) return c.json({ success: false, error: 'Session not found' }, 404);
  const meta = JSON.parse(session.metadata ?? '{}');
  const auditCounts = meta.auditCounts ?? {};
  return c.json({
    success: true,
    data: {
      companiesCreated: auditCounts.companiesCreated ?? 0,
      companiesUpdated: auditCounts.companiesUpdated ?? 0,
      companiesDeactivated: auditCounts.companiesDeactivated ?? 0,
      usersCreated: auditCounts.usersCreated ?? 0,
      usersUpdated: auditCounts.usersUpdated ?? 0,
      usersDeactivated: auditCounts.usersDeactivated ?? 0,
      membershipTypeMismatches: auditCounts.membershipTypeMismatches ?? 0,
      secondaryMemberships: auditCounts.secondaryMemberships ?? 0,
      notOnboarded: auditCounts.notOnboarded ?? 0,
      noPrimaryFlagged: auditCounts.noPrimaryFlagged ?? 0,
    },
  });
});

app.get("/api/sync/conflicts", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const session = await prisma.syncSession.findFirst({
    where: { type: { in: ['ALL', 'CONTINUE'] }, status: 'completed' },
    orderBy: { startedAt: 'desc' },
  });
  if (!session) return c.json({ success: true, data: [] });
  const meta = JSON.parse(session.metadata ?? '{}');
  return c.json({ success: true, data: meta.subscriptionConflicts ?? [] });
});

app.get("/api/config/membership-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const types = await prisma.companyMembershipType.findMany({ orderBy: { name: 'asc' } });
  return c.json({ success: true, data: types.map(t => t.name) });
});

app.post("/api/config/membership-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ success: false, error: 'Name is required' }, 400);
  const prisma = c.get('db');
  await prisma.companyMembershipType.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {},
  });
  return c.json({ success: true });
});

app.delete("/api/config/membership-types/:name", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const name = decodeURIComponent(c.req.param('name'));
  const prisma = c.get('db');
  await prisma.companyMembershipType.delete({ where: { name } }).catch(() => {});
  return c.json({ success: true });
});

app.get("/api/config/primary-subscription-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const types = await prisma.primarySubscriptionType.findMany({ orderBy: { name: 'asc' } });
  return c.json({ success: true, data: types.map(t => t.name) });
});

app.post("/api/config/primary-subscription-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ success: false, error: 'Name is required' }, 400);
  const prisma = c.get('db');
  await prisma.primarySubscriptionType.upsert({ where: { name: name.trim() }, create: { name: name.trim() }, update: {} });
  return c.json({ success: true });
});

app.delete("/api/config/primary-subscription-types/:name", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const name = decodeURIComponent(c.req.param('name'));
  const prisma = c.get('db');
  await prisma.primarySubscriptionType.delete({ where: { name } }).catch(() => {});
  return c.json({ success: true });
});

app.get("/api/config/addon-subscription-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const types = await prisma.addonSubscriptionType.findMany({ orderBy: { name: 'asc' } });
  return c.json({ success: true, data: types.map(t => t.name) });
});

app.post("/api/config/addon-subscription-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ success: false, error: 'Name is required' }, 400);
  const prisma = c.get('db');
  await prisma.addonSubscriptionType.upsert({ where: { name: name.trim() }, create: { name: name.trim() }, update: {} });
  return c.json({ success: true });
});

app.delete("/api/config/addon-subscription-types/:name", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const name = decodeURIComponent(c.req.param('name'));
  const prisma = c.get('db');
  await prisma.addonSubscriptionType.delete({ where: { name } }).catch(() => {});
  return c.json({ success: true });
});

app.get("/api/reports", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db') as PrismaClient;

  // Optional custom date range (YYYY-MM-DD). When provided, scopes users/companies/subscriptions
  // to records created in the window, and replaces the default 30-day engagement window.
  const parseDate = (raw: string | undefined, endOfDay = false): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) d.setUTCHours(23, 59, 59, 999);
    else d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  const rangeFrom = parseDate(c.req.query('from'));
  const rangeTo = parseDate(c.req.query('to'), true);
  const hasCustomRange = rangeFrom != null || rangeTo != null;
  const createdAtWhere = hasCustomRange
    ? { createdAt: { ...(rangeFrom ? { gte: rangeFrom } : {}), ...(rangeTo ? { lte: rangeTo } : {}) } }
    : {};

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const engagementFrom = rangeFrom ?? thirtyDaysAgo;
  const engagementTo = rangeTo ?? null;
  const engagementWhere = { createdAt: { gte: engagementFrom, ...(engagementTo ? { lte: engagementTo } : {}) } };

  const cmtNames = (await prisma.companyMembershipType.findMany({ select: { name: true } })).map(t => t.name);

  const cmtWhere = {
    OR: [
      { primaryMembership: { in: cmtNames } },
      { primaryMembership: null, addOns: { not: '[]' } },
      { primaryMembership: null, company: { membershipTypes: { not: '[]' } } },
    ],
  };

  const [subs, users, companies, loginsCount, samlRequests, serviceProviders, recentSessions, activeSessionUsers] = await Promise.all([
    prisma.subscription.findMany({
      where: createdAtWhere,
      select: { title: true, rate: true, frequency: true, companyId: true, status: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: Role.USER, ...cmtWhere, ...createdAtWhere },
      select: { primaryMembership: true, addOns: true, active: true, companyId: true, memberSourceCompany: true, createdAt: true },
    }),
    prisma.company.findMany({
      where: { isPersonal: false, NOT: { email: { contains: 'placeholder.invalid' } }, ...createdAtWhere },
      select: { id: true, name: true, active: true, membershipTypes: true, createdAt: true },
    }),
    prisma.session.count({ where: engagementWhere }),
    // Selected (not just counted) so "SSO Launches by Platform" can be broken down the same
    // way as the weekly/monthly reports, instead of just a static "Connected Service
    // Providers" list.
    prisma.samlAuthRequest.findMany({
      where: { completedAt: { not: null }, ...engagementWhere },
      select: { serviceProviderId: true, userId: true },
    }),
    prisma.serviceProvider.findMany({ where: { active: true }, select: { id: true, name: true, logo: true } }),
    prisma.session.findMany({
      where: engagementWhere,
      select: { userId: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // Separate from recentSessions (which is capped at 10 for the UI list) — this needs the
    // full window to get an accurate distinct-user count, not just the 10 newest rows.
    prisma.session.findMany({
      where: engagementWhere,
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  // Match the same "CMT rules" scoping /admin/companies applies by default: a company only
  // counts here if it has at least one membershipType recognized as a CompanyMembershipType.
  const cmtNameSet = new Set(cmtNames);
  const cmtCompanies = companies.filter(co => {
    try {
      const types: string[] = JSON.parse(co.membershipTypes || '[]');
      return types.some(t => cmtNameSet.has(t));
    } catch {
      return false;
    }
  });

  const toMonthly = (rate: number, frequency: string) => {
    const f = frequency.toLowerCase();
    if (f.includes('annual')) return rate / 12;
    if (f.includes('quarter')) return rate / 3;
    return rate;
  };

  // PV's `status` field, not the presence of a `rate`, is the source of truth for whether a
  // subscription is still live — cancelled subscriptions keep their last-known rate in our DB
  // (see peopleVineServiceV2.ts sync), so summing all statuses over-counts revenue that no
  // longer exists. Only active, paid subscriptions count toward MRR/ARR and related KPIs.
  // Matches the null-handling convention used elsewhere for this same PV status field
  // (peopleVineService.ts, peopleVineServiceV2.ts): an absent status defaults to active.
  const isActiveStatus = (status: string | null | undefined) =>
    status == null || status.trim() === '' ? true : status.trim().toLowerCase() === 'active';
  const activeSubs = subs.filter(s => isActiveStatus(s.status));
  const payingSubs = activeSubs.filter(s => s.rate != null && s.rate > 0);
  const mrr = payingSubs.reduce((sum, s) => sum + toMonthly(s.rate!, s.frequency ?? ''), 0);

  const byTitleMap = new Map<string, { count: number; mrr: number }>();
  for (const s of payingSubs) {
    const t = (s.title || 'Unknown').trim();
    const prev = byTitleMap.get(t) ?? { count: 0, mrr: 0 };
    byTitleMap.set(t, { count: prev.count + 1, mrr: prev.mrr + toMonthly(s.rate!, s.frequency ?? '') });
  }
  const byTitle = [...byTitleMap.entries()]
    .map(([title, v]) => ({ title, count: v.count, mrr: Math.round(v.mrr) }))
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 15);

  const byFreqMap = new Map<string, number>();
  for (const s of activeSubs) {
    const f = s.frequency || 'Unknown';
    byFreqMap.set(f, (byFreqMap.get(f) ?? 0) + 1);
  }
  const byFrequency = [...byFreqMap.entries()]
    .map(([frequency, count]) => ({ frequency, count }))
    .sort((a, b) => b.count - a.count);

  const activeUsers = users.filter(u => u.active).length;

  const byPrimaryMap = new Map<string, number>();
  for (const u of users) {
    if (!u.primaryMembership) continue;
    byPrimaryMap.set(u.primaryMembership, (byPrimaryMap.get(u.primaryMembership) ?? 0) + 1);
  }
  const byPrimaryMembership = [...byPrimaryMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const byAddonMap = new Map<string, number>();
  for (const u of users) {
    try {
      const addons: string[] = JSON.parse(u.addOns || '[]');
      for (const a of addons) byAddonMap.set(a, (byAddonMap.get(a) ?? 0) + 1);
    } catch {}
  }
  const byAddOn = [...byAddonMap.entries()]
    .map(([addon, count]) => ({ addon, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // affiliated: users whose companyId points to this company
  const coUserMap = new Map<string, number>();
  for (const u of users) coUserMap.set(u.companyId, (coUserMap.get(u.companyId) ?? 0) + 1);

  const coIdSet = new Set(cmtCompanies.map(c => c.id));

  const coSubMap = new Map<string, { count: number; mrr: number }>();
  for (const s of payingSubs) {
    if (!s.companyId || !coIdSet.has(s.companyId)) continue; // skip personal companies
    const prev = coSubMap.get(s.companyId) ?? { count: 0, mrr: 0 };
    coSubMap.set(s.companyId, { count: prev.count + 1, mrr: prev.mrr + toMonthly(s.rate!, s.frequency ?? '') });
  }

  const coIdMap = new Map(cmtCompanies.map(c => [c.id, c.name]));
  // name → id lookup for memberSourceCompany matching (case-insensitive)
  const coNameToIdMap = new Map(cmtCompanies.map(c => [c.name.trim().toLowerCase(), c.id]));

  // sponsored: users where memberSourceCompany points to a DIFFERENT company than their affiliated one
  const coSponsoredMap = new Map<string, number>();
  let crossCompanyCount = 0;
  for (const u of users) {
    if (!u.memberSourceCompany) continue;
    const srcId = coNameToIdMap.get(u.memberSourceCompany.trim().toLowerCase());
    if (!srcId || srcId === u.companyId) continue;
    crossCompanyCount++;
    coSponsoredMap.set(srcId, (coSponsoredMap.get(srcId) ?? 0) + 1);
  }

  const topByMembers = cmtCompanies
    .map(c => ({
      name: c.name,
      affiliated: coUserMap.get(c.id) ?? 0,
      sponsored: coSponsoredMap.get(c.id) ?? 0,
    }))
    .sort((a, b) => (b.affiliated + b.sponsored) - (a.affiliated + a.sponsored))
    .slice(0, 10);

  const topByRevenue = [...coSubMap.entries()]
    .map(([id, v]) => ({ name: coIdMap.get(id) ?? id, subCount: v.count, mrr: Math.round(v.mrr) }))
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 10);

  const withSubs = cmtCompanies.filter(c => coSubMap.has(c.id)).length;
  const avgMrrPerCo = withSubs > 0 ? Math.round(mrr / withSubs) : 0;
  const avgMembersPerCo = cmtCompanies.length > 0 ? Math.round((users.length / cmtCompanies.length) * 10) / 10 : 0;

  const sizeCounts = { '1 member': 0, '2–3 members': 0, '4–9 members': 0, '10+ members': 0 };
  for (const c of cmtCompanies) {
    const n = coUserMap.get(c.id) ?? 0;
    if (n === 1) sizeCounts['1 member']++;
    else if (n <= 3) sizeCounts['2–3 members']++;
    else if (n <= 9) sizeCounts['4–9 members']++;
    else sizeCounts['10+ members']++;
  }
  const bySize = Object.entries(sizeCounts).map(([label, count]) => ({ label, count }));

  const activeUsersLast30d = activeSessionUsers.length;

  const serviceProviderNameById = new Map(serviceProviders.map(sp => [sp.id, sp.name]));
  const platformStats = new Map<string, { launches: number; users: Set<string> }>();
  for (const req of samlRequests) {
    const entry = platformStats.get(req.serviceProviderId) ?? { launches: 0, users: new Set<string>() };
    entry.launches++;
    if (req.userId) entry.users.add(req.userId);
    platformStats.set(req.serviceProviderId, entry);
  }
  const byPlatform = [...platformStats.entries()]
    .map(([id, v]) => ({
      name: serviceProviderNameById.get(id) ?? 'Unknown',
      launches: v.launches,
      uniqueUsers: v.users.size,
    }))
    .sort((a, b) => b.launches - a.launches);

  return c.json({
    success: true,
    data: {
      dateRange: hasCustomRange ? { from: rangeFrom?.toISOString() ?? null, to: rangeTo?.toISOString() ?? null } : null,
      revenue: {
        mrr: Math.round(mrr),
        arr: Math.round(mrr * 12),
        totalSubs: activeSubs.length,
        payingSubs: payingSubs.length,
        avgPerSub: payingSubs.length > 0 ? Math.round(mrr / payingSubs.length) : 0,
        byTitle,
        byFrequency,
      },
      membership: {
        totalUsers: users.length,
        activeUsers,
        inactiveUsers: users.length - activeUsers,
        byPrimaryMembership,
        byAddOn,
        companies: {
          total: cmtCompanies.length,
          withSubs,
          avgMembersPerCo,
          avgMrrPerCo,
          crossCompanyCount,
          topByMembers,
          topByRevenue,
          bySize,
        },
      },
      engagement: {
        loginsLast30d: loginsCount,
        ssoLast30d: samlRequests.length,
        activeUsersLast30d,
        serviceProviders,
        byPlatform,
        recentSessions: recentSessions.map(s => ({
          userId: s.userId,
          userName: (s.user as any)?.name ?? 'Unknown',
          createdAt: s.createdAt,
        })),
      },
    },
  });
});

app.get("/api/reports/weekly", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db') as PrismaClient;

  const requestedOffset = Number(c.req.query('offset') ?? '0');
  const offset = Number.isInteger(requestedOffset) ? Math.min(0, Math.max(-104, requestedOffset)) : 0;

  const now = new Date();
  const dayIndex = (now.getUTCDay() + 6) % 7;
  const currentMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayIndex));
  const weekStart = new Date(currentMonday.getTime() + offset * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekEnd = weekStart;

  const cmtNames = (await prisma.companyMembershipType.findMany({ select: { name: true } })).map(t => t.name);
  const cmtWhere = {
    OR: [
      { primaryMembership: { in: cmtNames } },
      { primaryMembership: null, addOns: { not: '[]' } },
      { primaryMembership: null, company: { membershipTypes: { not: '[]' } } },
    ],
  };

  const [
    newMembers, newMembersPrev, weekLogs, prevWeekLogs, companies, subscriptions,
    weekSessions, prevWeekSessions, weekSaml, prevWeekSaml, serviceProviders, newPayingUsers,
  ] = await Promise.all([
    prisma.user.count({ where: { role: Role.USER, createdAt: { gte: weekStart, lt: weekEnd }, ...cmtWhere } }),
    prisma.user.count({ where: { role: Role.USER, createdAt: { gte: prevWeekStart, lt: prevWeekEnd }, ...cmtWhere } }),
    prisma.webhookLog.findMany({
      where: { receivedAt: { gte: weekStart, lt: weekEnd }, status: { in: ['processed', 'processed_invalid_membership'] } },
      select: { customerNo: true, eventType: true, diff: true },
    }),
    prisma.webhookLog.findMany({
      where: { receivedAt: { gte: prevWeekStart, lt: prevWeekEnd }, status: { in: ['processed', 'processed_invalid_membership'] } },
      select: { eventType: true, diff: true },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.subscription.findMany({ select: { title: true, companyId: true, rate: true, frequency: true } }),
    prisma.session.findMany({ where: { createdAt: { gte: weekStart, lt: weekEnd } }, select: { createdAt: true, userId: true } }),
    prisma.session.findMany({ where: { createdAt: { gte: prevWeekStart, lt: prevWeekEnd } }, select: { userId: true } }),
    prisma.samlAuthRequest.findMany({
      where: { completedAt: { not: null }, createdAt: { gte: weekStart, lt: weekEnd } },
      select: { userId: true, serviceProviderId: true },
    }),
    prisma.samlAuthRequest.findMany({
      where: { completedAt: { not: null }, createdAt: { gte: prevWeekStart, lt: prevWeekEnd } },
      select: { serviceProviderId: true },
    }),
    prisma.serviceProvider.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: Role.USER, createdAt: { gte: weekStart, lt: weekEnd }, primaryMembership: { not: null } },
      select: { companyId: true, primaryMembership: true },
    }),
  ]);

  const toMonthly = (rate: number, frequency: string) => {
    const f = frequency.toLowerCase();
    if (f.includes('annual')) return rate / 12;
    if (f.includes('quarter')) return rate / 3;
    return rate;
  };

  const rateByCompanyTitle = new Map<string, number>();
  for (const s of subscriptions) {
    if (s.rate == null || s.rate <= 0 || !s.companyId) continue;
    rateByCompanyTitle.set(`${s.companyId}::${s.title}`, toMonthly(s.rate, s.frequency ?? ''));
  }

  type WebhookDiff = { user?: { before?: Record<string, any>; after?: Record<string, any> } };
  const parseDiff = (raw: string | null): WebhookDiff | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const isDeactivation = (diff: WebhookDiff | null) =>
    diff?.user?.before?.active === true && diff?.user?.after?.active === false;

  type MovementEvent = { customerNo: number | null; changeType: 'Cancelled' | 'Inactive'; membership: string | null; sponsoringCompany: string | null };
  const movementEvents: MovementEvent[] = [];
  for (const log of weekLogs) {
    const diff = parseDiff(log.diff);
    if (!isDeactivation(diff)) continue;
    movementEvents.push({
      customerNo: log.customerNo,
      changeType: log.eventType === 'membership_changed' ? 'Cancelled' : 'Inactive',
      membership: diff!.user!.before!.primaryMembership ?? null,
      sponsoringCompany: diff!.user!.before!.memberSourceCompany ?? null,
    });
  }

  let cancelledPrev = 0;
  let inactivePrev = 0;
  for (const log of prevWeekLogs) {
    const diff = parseDiff(log.diff);
    if (!isDeactivation(diff)) continue;
    if (log.eventType === 'membership_changed') cancelledPrev++;
    else inactivePrev++;
  }

  const cancelled = movementEvents.filter(e => e.changeType === 'Cancelled').length;
  const inactive = movementEvents.filter(e => e.changeType === 'Inactive').length;
  const netChange = newMembers - cancelled - inactive;
  const netChangePrev = newMembersPrev - cancelledPrev - inactivePrev;

  const customerNos = movementEvents.map(e => e.customerNo).filter((n): n is number => n != null).map(String);
  const affectedUsers = customerNos.length > 0
    ? await prisma.user.findMany({ where: { peopleVineId: { in: customerNos } }, select: { peopleVineId: true, name: true, email: true, companyId: true } })
    : [];
  const userByPvId = new Map(affectedUsers.map(u => [u.peopleVineId, u]));
  const companyNameById = new Map(companies.map(co => [co.id, co.name]));

  const changes = movementEvents.slice(0, 100).map(e => {
    const affected = e.customerNo != null ? userByPvId.get(String(e.customerNo)) : undefined;
    const affiliatedCompany = affected ? companyNameById.get(affected.companyId) ?? null : null;
    const rate = affected && e.membership ? rateByCompanyTitle.get(`${affected.companyId}::${e.membership}`) ?? null : null;
    return {
      member: affected?.email ?? affected?.name ?? (e.customerNo != null ? `PV #${e.customerNo}` : 'Unknown'),
      membership: e.membership ?? 'Unknown',
      changeType: e.changeType,
      affiliatedCompany: affiliatedCompany ?? '—',
      sponsoringCompany: e.sponsoringCompany ?? affiliatedCompany ?? '—',
      mrr: rate != null ? Math.round(rate) : null,
    };
  });

  const lostFromCancellations = changes
    .filter(d => d.changeType === 'Cancelled' && d.mrr != null)
    .reduce((sum, d) => sum + (d.mrr ?? 0), 0);

  const gainedFromNew = newPayingUsers.reduce((sum, u) => {
    const rate = u.primaryMembership ? rateByCompanyTitle.get(`${u.companyId}::${u.primaryMembership}`) : undefined;
    return sum + (rate ?? 0);
  }, 0);

  const pctChange = (curr: number, prev: number) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0));

  const logins = weekSessions.length;
  const loginsPrev = prevWeekSessions.length;
  const activeUsersSet = new Set(weekSessions.map(s => s.userId));
  const activeUsersPrevSet = new Set(prevWeekSessions.map(s => s.userId));
  const activeUsersCount = activeUsersSet.size;
  const ssoLaunches = weekSaml.length;
  const ssoLaunchesPrev = prevWeekSaml.length;
  const sessionsPerUser = activeUsersCount > 0 ? Math.round((logins / activeUsersCount) * 10) / 10 : 0;

  const serviceProviderNameById = new Map(serviceProviders.map(sp => [sp.id, sp.name]));
  const platformStats = new Map<string, { launches: number; users: Set<string> }>();
  for (const req of weekSaml) {
    const entry = platformStats.get(req.serviceProviderId) ?? { launches: 0, users: new Set<string>() };
    entry.launches++;
    if (req.userId) entry.users.add(req.userId);
    platformStats.set(req.serviceProviderId, entry);
  }
  const platformPrevCounts = new Map<string, number>();
  for (const req of prevWeekSaml) {
    platformPrevCounts.set(req.serviceProviderId, (platformPrevCounts.get(req.serviceProviderId) ?? 0) + 1);
  }
  const byPlatform = [...platformStats.entries()]
    .map(([id, v]) => ({
      name: serviceProviderNameById.get(id) ?? 'Unknown',
      launches: v.launches,
      uniqueUsers: v.users.size,
      changePct: pctChange(v.launches, platformPrevCounts.get(id) ?? 0),
    }))
    .sort((a, b) => b.launches - a.launches);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyCounts = new Array(7).fill(0);
  for (const s of weekSessions) {
    const dayOffset = Math.floor((s.createdAt.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    if (dayOffset >= 0 && dayOffset < 7) dailyCounts[dayOffset]++;
  }
  const dailyLogins = dayLabels.map((day, i) => ({ day, count: dailyCounts[i] }));

  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(new Date(weekEnd.getTime() - 1))}, ${weekStart.getUTCFullYear()}`;
  const prevWeekLabel = `${fmtDate(prevWeekStart)} – ${fmtDate(new Date(prevWeekEnd.getTime() - 1))}`;

  return c.json({
    success: true,
    data: {
      offset,
      weekLabel,
      prevWeekLabel,
      canGoForward: offset < 0,
      movement: {
        newMembers,
        newMembersDelta: newMembers - newMembersPrev,
        cancelled,
        cancelledDelta: cancelled - cancelledPrev,
        inactive,
        inactiveDelta: inactive - inactivePrev,
        netChange,
        netChangeDelta: netChange - netChangePrev,
      },
      income: {
        netChange: Math.round(gainedFromNew - lostFromCancellations),
        lostFromCancellations: Math.round(lostFromCancellations),
        gainedFromNew: Math.round(gainedFromNew),
      },
      changes,
      engagement: {
        logins,
        loginsChangePct: pctChange(logins, loginsPrev),
        ssoLaunches,
        ssoLaunchesChangePct: pctChange(ssoLaunches, ssoLaunchesPrev),
        activeUsers: activeUsersCount,
        activeUsersChangePct: pctChange(activeUsersCount, activeUsersPrevSet.size),
        sessionsPerUser,
        byPlatform,
        dailyLogins,
      },
    },
  });
});

app.get("/api/reports/monthly", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db') as PrismaClient;

  const requestedOffset = Number(c.req.query('offset') ?? '0');
  const offset = Number.isInteger(requestedOffset) ? Math.min(0, Math.max(-24, requestedOffset)) : 0;

  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStart = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() + offset, 1));
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const prevMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
  const prevMonthEnd = monthStart;

  const cmtNames = (await prisma.companyMembershipType.findMany({ select: { name: true } })).map(t => t.name);
  const cmtWhere = {
    OR: [
      { primaryMembership: { in: cmtNames } },
      { primaryMembership: null, addOns: { not: '[]' } },
      { primaryMembership: null, company: { membershipTypes: { not: '[]' } } },
    ],
  };

  const [
    newMembers, newMembersPrev, monthLogs, prevMonthLogs, companies, subscriptions,
    monthSessions, prevMonthSessions, monthSaml, prevMonthSaml, serviceProviders, newPayingUsers,
  ] = await Promise.all([
    prisma.user.count({ where: { role: Role.USER, createdAt: { gte: monthStart, lt: monthEnd }, ...cmtWhere } }),
    prisma.user.count({ where: { role: Role.USER, createdAt: { gte: prevMonthStart, lt: prevMonthEnd }, ...cmtWhere } }),
    prisma.webhookLog.findMany({
      where: { receivedAt: { gte: monthStart, lt: monthEnd }, status: { in: ['processed', 'processed_invalid_membership'] } },
      select: { customerNo: true, eventType: true, diff: true },
    }),
    prisma.webhookLog.findMany({
      where: { receivedAt: { gte: prevMonthStart, lt: prevMonthEnd }, status: { in: ['processed', 'processed_invalid_membership'] } },
      select: { eventType: true, diff: true },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.subscription.findMany({ select: { title: true, companyId: true, rate: true, frequency: true } }),
    prisma.session.findMany({ where: { createdAt: { gte: monthStart, lt: monthEnd } }, select: { createdAt: true, userId: true } }),
    prisma.session.findMany({ where: { createdAt: { gte: prevMonthStart, lt: prevMonthEnd } }, select: { userId: true } }),
    prisma.samlAuthRequest.findMany({
      where: { completedAt: { not: null }, createdAt: { gte: monthStart, lt: monthEnd } },
      select: { userId: true, serviceProviderId: true },
    }),
    prisma.samlAuthRequest.findMany({
      where: { completedAt: { not: null }, createdAt: { gte: prevMonthStart, lt: prevMonthEnd } },
      select: { serviceProviderId: true },
    }),
    prisma.serviceProvider.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: Role.USER, createdAt: { gte: monthStart, lt: monthEnd }, primaryMembership: { not: null } },
      select: { companyId: true, primaryMembership: true },
    }),
  ]);

  const toMonthly = (rate: number, frequency: string) => {
    const f = frequency.toLowerCase();
    if (f.includes('annual')) return rate / 12;
    if (f.includes('quarter')) return rate / 3;
    return rate;
  };

  const rateByCompanyTitle = new Map<string, number>();
  for (const s of subscriptions) {
    if (s.rate == null || s.rate <= 0 || !s.companyId) continue;
    rateByCompanyTitle.set(`${s.companyId}::${s.title}`, toMonthly(s.rate, s.frequency ?? ''));
  }

  type WebhookDiff = { user?: { before?: Record<string, any>; after?: Record<string, any> } };
  const parseDiff = (raw: string | null): WebhookDiff | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const isDeactivation = (diff: WebhookDiff | null) =>
    diff?.user?.before?.active === true && diff?.user?.after?.active === false;

  type MovementEvent = { customerNo: number | null; changeType: 'Cancelled' | 'Inactive'; membership: string | null; sponsoringCompany: string | null };
  const movementEvents: MovementEvent[] = [];
  for (const log of monthLogs) {
    const diff = parseDiff(log.diff);
    if (!isDeactivation(diff)) continue;
    movementEvents.push({
      customerNo: log.customerNo,
      changeType: log.eventType === 'membership_changed' ? 'Cancelled' : 'Inactive',
      membership: diff!.user!.before!.primaryMembership ?? null,
      sponsoringCompany: diff!.user!.before!.memberSourceCompany ?? null,
    });
  }

  let cancelledPrev = 0;
  let inactivePrev = 0;
  for (const log of prevMonthLogs) {
    const diff = parseDiff(log.diff);
    if (!isDeactivation(diff)) continue;
    if (log.eventType === 'membership_changed') cancelledPrev++;
    else inactivePrev++;
  }

  const cancelled = movementEvents.filter(e => e.changeType === 'Cancelled').length;
  const inactive = movementEvents.filter(e => e.changeType === 'Inactive').length;
  const netChange = newMembers - cancelled - inactive;
  const netChangePrev = newMembersPrev - cancelledPrev - inactivePrev;

  const customerNos = movementEvents.map(e => e.customerNo).filter((n): n is number => n != null).map(String);
  const affectedUsers = customerNos.length > 0
    ? await prisma.user.findMany({ where: { peopleVineId: { in: customerNos } }, select: { peopleVineId: true, name: true, email: true, companyId: true } })
    : [];
  const userByPvId = new Map(affectedUsers.map(u => [u.peopleVineId, u]));
  const companyNameById = new Map(companies.map(co => [co.id, co.name]));

  const changes = movementEvents.slice(0, 100).map(e => {
    const affected = e.customerNo != null ? userByPvId.get(String(e.customerNo)) : undefined;
    const affiliatedCompany = affected ? companyNameById.get(affected.companyId) ?? null : null;
    const rate = affected && e.membership ? rateByCompanyTitle.get(`${affected.companyId}::${e.membership}`) ?? null : null;
    return {
      member: affected?.email ?? affected?.name ?? (e.customerNo != null ? `PV #${e.customerNo}` : 'Unknown'),
      membership: e.membership ?? 'Unknown',
      changeType: e.changeType,
      affiliatedCompany: affiliatedCompany ?? '—',
      sponsoringCompany: e.sponsoringCompany ?? affiliatedCompany ?? '—',
      mrr: rate != null ? Math.round(rate) : null,
    };
  });

  const lostFromCancellations = changes
    .filter(d => d.changeType === 'Cancelled' && d.mrr != null)
    .reduce((sum, d) => sum + (d.mrr ?? 0), 0);

  const gainedFromNew = newPayingUsers.reduce((sum, u) => {
    const rate = u.primaryMembership ? rateByCompanyTitle.get(`${u.companyId}::${u.primaryMembership}`) : undefined;
    return sum + (rate ?? 0);
  }, 0);

  const pctChange = (curr: number, prev: number) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0));

  const logins = monthSessions.length;
  const loginsPrev = prevMonthSessions.length;
  const activeUsersSet = new Set(monthSessions.map(s => s.userId));
  const activeUsersPrevSet = new Set(prevMonthSessions.map(s => s.userId));
  const activeUsersCount = activeUsersSet.size;
  const ssoLaunches = monthSaml.length;
  const ssoLaunchesPrev = prevMonthSaml.length;
  const sessionsPerUser = activeUsersCount > 0 ? Math.round((logins / activeUsersCount) * 10) / 10 : 0;

  const serviceProviderNameById = new Map(serviceProviders.map(sp => [sp.id, sp.name]));
  const platformStats = new Map<string, { launches: number; users: Set<string> }>();
  for (const req of monthSaml) {
    const entry = platformStats.get(req.serviceProviderId) ?? { launches: 0, users: new Set<string>() };
    entry.launches++;
    if (req.userId) entry.users.add(req.userId);
    platformStats.set(req.serviceProviderId, entry);
  }
  const platformPrevCounts = new Map<string, number>();
  for (const req of prevMonthSaml) {
    platformPrevCounts.set(req.serviceProviderId, (platformPrevCounts.get(req.serviceProviderId) ?? 0) + 1);
  }
  const byPlatform = [...platformStats.entries()]
    .map(([id, v]) => ({
      name: serviceProviderNameById.get(id) ?? 'Unknown',
      launches: v.launches,
      uniqueUsers: v.users.size,
      changePct: pctChange(v.launches, platformPrevCounts.get(id) ?? 0),
    }))
    .sort((a, b) => b.launches - a.launches);

  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));
  const dailyCounts = new Array(daysInMonth).fill(0);
  for (const s of monthSessions) {
    const dayOffset = Math.floor((s.createdAt.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));
    if (dayOffset >= 0 && dayOffset < daysInMonth) dailyCounts[dayOffset]++;
  }
  const dailyLogins = dailyCounts.map((count, i) => ({ day: String(i + 1), count }));

  const monthLabel = `${monthStart.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} ${monthStart.getUTCFullYear()}`;
  const prevMonthLabel = `${prevMonthStart.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} ${prevMonthStart.getUTCFullYear()}`;

  return c.json({
    success: true,
    data: {
      offset,
      monthLabel,
      prevMonthLabel,
      canGoForward: offset < 0,
      movement: {
        newMembers,
        newMembersDelta: newMembers - newMembersPrev,
        cancelled,
        cancelledDelta: cancelled - cancelledPrev,
        inactive,
        inactiveDelta: inactive - inactivePrev,
        netChange,
        netChangeDelta: netChange - netChangePrev,
      },
      income: {
        netChange: Math.round(gainedFromNew - lostFromCancellations),
        lostFromCancellations: Math.round(lostFromCancellations),
        gainedFromNew: Math.round(gainedFromNew),
      },
      changes,
      engagement: {
        logins,
        loginsChangePct: pctChange(logins, loginsPrev),
        ssoLaunches,
        ssoLaunchesChangePct: pctChange(ssoLaunches, ssoLaunchesPrev),
        activeUsers: activeUsersCount,
        activeUsersChangePct: pctChange(activeUsersCount, activeUsersPrevSet.size),
        sessionsPerUser,
        byPlatform,
        dailyLogins,
      },
    },
  });
});

app.get("/api/config/free-member-exclusion-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const types = await prisma.freeMemberExclusionType.findMany({ orderBy: { name: 'asc' } });
  return c.json({ success: true, data: types.map(t => t.name) });
});

app.post("/api/config/free-member-exclusion-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ success: false, error: 'Name is required' }, 400);
  const prisma = c.get('db');
  await prisma.freeMemberExclusionType.upsert({ where: { name: name.trim() }, create: { name: name.trim() }, update: {} });
  return c.json({ success: true });
});

app.delete("/api/config/free-member-exclusion-types/:name", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const name = decodeURIComponent(c.req.param('name'));
  const prisma = c.get('db');
  await prisma.freeMemberExclusionType.delete({ where: { name } }).catch(() => {});
  return c.json({ success: true });
});

app.get("/api/config/portal-access-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const prisma = c.get('db');
  const types = await prisma.portalAccessType.findMany({ orderBy: { name: 'asc' } });
  return c.json({ success: true, data: types.map(t => t.name) });
});

app.post("/api/config/portal-access-types", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ success: false, error: 'Name is required' }, 400);
  const prisma = c.get('db');
  await prisma.portalAccessType.upsert({ where: { name: name.trim() }, create: { name: name.trim() }, update: {} });
  return c.json({ success: true });
});

app.delete("/api/config/portal-access-types/:name", async (c) => {
  const user = c.get('user');
  if (user?.role !== 'ADMIN') return c.json({ success: false }, 403);
  const name = decodeURIComponent(c.req.param('name'));
  const prisma = c.get('db');
  await prisma.portalAccessType.delete({ where: { name } }).catch(() => {});
  return c.json({ success: true });
});


app.post("/__internal/sync", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  if (auth !== `Bearer ${c.env.SEED_TOKEN}`) return c.json({ success: false }, 401);
  let type = 'ALL';
  try { const body = await c.req.json(); type = body?.type === 'CONTINUE' ? 'CONTINUE' : 'ALL'; } catch {}
  const prisma = c.get('db') as PrismaClient;
  const session = await prisma.syncSession.create({
    data: {
      type,
      status: 'pending',
      step: 'Queued',
      logs: JSON.stringify([{ time: new Date().toISOString(), level: 'info', message: 'Scheduled sync queued' }]),
      metadata: JSON.stringify({ includeFreeMembers: true }),
    },
  });
  await c.env.QUEUE.send({
    jobId: crypto.randomUUID(),
    jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
    payload: { type, sessionId: session.id },
  });
  return c.json({ success: true, message: `Sync ${type === 'CONTINUE' ? 'continue' : 'all'} queued` });
});


export default {
  fetch: app.fetch,
  queue: queueConsumer,
  scheduled: scheduledHandler,
};
