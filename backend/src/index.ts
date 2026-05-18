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
import { fetchAllPvData, fetchPvPage } from "@/services/peopleVineService";


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
  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({ orderBy: { receivedAt: 'desc' }, take: limit, skip: offset }),
    prisma.webhookLog.count(),
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
    companies: { subscriptionNo: string; companyName: string; membershipType: string | null }[];
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
  await prisma.portalAccessType.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {},
  });
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
  await c.env.QUEUE.send({
    jobId: crypto.randomUUID(),
    jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
    payload: { type },
  });
  return c.json({ success: true, message: `Sync ${type === 'CONTINUE' ? 'continue' : 'all'} queued` });
});


export default {
  fetch: app.fetch,
  queue: queueConsumer,
  scheduled: scheduledHandler,
};
