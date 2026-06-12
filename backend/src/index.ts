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
import serviceProviderRoutes from "@/routes/serviceProvider";
import samlRoutes from "@/routes/saml";
// import seedRoute from "@/database/seed";
import webhookRoutes from "@/routes/webhook";
import queueConsumer, { JobType } from "./controllers/queueConsumer";
import scheduledHandler from "./controllers/scheduledHandler";
import { markPublic } from "./middleware/markPublic";
import { Role } from "@prisma/client";
import { fetchAllPvData, fetchPvPage, readAuditChunks } from "@/services/peopleVineService";


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

app.use("/api/*", corsMiddleware, databaseMiddleware, authMiddleware);
app.route("/api/login", loginRoutes);
app.route("/api/user", userRoutes);
app.route("/api/company", companyRoutes);
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
  const session = await prisma.syncSession.create({
    data: {
      type,
      status: 'pending',
      step: 'Queued',
      logs: JSON.stringify([{ time: new Date().toISOString(), level: 'info', message: 'Sync queued' }]),
      metadata: JSON.stringify({ includeFreeMembers }),
    },
  });
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
