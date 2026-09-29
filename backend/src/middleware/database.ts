import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { Context } from "hono";

// One PrismaClient per request (or per queue batch / cron run), always $disconnect()ed
// when that work is done. Two ways this has gone wrong before:
// - A client per request that was never disconnected leaked Prisma's WASM query-compiler
//   memory until queries died with "memory access out of bounds" (prisma/prisma#25714).
//   $disconnect() calls queryCompiler.free(), which is what releases it.
// - One client shared across the isolate made concurrent requests await promises created
//   by another request, which Workers forbids — the waiting request hung until the runtime
//   canceled it ("Worker's code had hung and would never generate a response").
export const createPrisma = (db: D1Database): PrismaClient =>
  new PrismaClient({ adapter: new PrismaD1(db) });

export const databaseMiddleware = async (c: Context, next: () => Promise<any>) => {
  const db = c.env.DB as D1Database;
  if (!db) {
    throw new Error("D1 database not found");
  }
  const prisma = createPrisma(db);
  c.set("db", prisma);

  // Controllers hand DB work to waitUntil that keeps running after the response is sent
  // (webhook logs, onboarding emails), so only disconnect once all of it has settled.
  const ctx = c.executionCtx;
  const background: Promise<unknown>[] = [];
  const waitUntil = ctx.waitUntil.bind(ctx);
  ctx.waitUntil = (promise: Promise<unknown>) => {
    background.push(promise);
    waitUntil(promise);
  };

  try {
    return await next();
  } finally {
    waitUntil((async () => {
      // Background work can itself call waitUntil, so keep draining until nothing new appears.
      let settled = 0;
      while (settled < background.length) {
        settled = background.length;
        await Promise.allSettled(background);
      }
      await prisma.$disconnect().catch(() => {});
    })());
  }
};
