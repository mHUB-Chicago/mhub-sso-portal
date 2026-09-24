import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { Context } from "hono";

// One PrismaClient per isolate, not per request. Prisma's WASM query engine doesn't
// release its memory between clients, so building a new one on every request slowly
// exhausted a long-lived isolate until queries died with "memory access out of bounds"
// (prisma/prisma#25714) — logins then failed until Cloudflare recycled the isolate.
let cached: { db: D1Database; prisma: PrismaClient } | null = null;

export const getPrisma = (db: D1Database): PrismaClient => {
  if (!cached || cached.db !== db) {
    cached = { db, prisma: new PrismaClient({ adapter: new PrismaD1(db) }) };
  }
  return cached.prisma;
};

// Drop the cached client after a WASM crash so the next request builds a fresh one
// instead of reusing a possibly corrupted instance.
export const resetPrisma = (): void => {
  cached = null;
};

export const isWasmCrash = (error: unknown): boolean =>
  error instanceof Error && /memory access out of bounds|Invalid typed array length|Invalid array buffer length/i.test(error.message);

export const databaseMiddleware = async (c: Context, next: () => Promise<any>) => {
  const db = c.env.DB as D1Database;
  if (!db) {
    throw new Error("D1 database not found");
  }
  if (!c.get("db")) {
    c.set("db", getPrisma(db));
  }
  try {
    return await next();
  } catch (error) {
    if (isWasmCrash(error)) resetPrisma();
    throw error;
  }
};
