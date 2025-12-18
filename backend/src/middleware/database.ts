import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { Context } from "hono";

export const databaseMiddleware = async (c: Context, next: () => Promise<any>) => {
  const db = c.env.DB as D1Database;
  if (!db) {
    throw new Error("D1 database not found");
  }
  const existingClient = c.get("db") as PrismaClient;
  if (!existingClient) {
    const prisma = new PrismaClient({ adapter: new PrismaD1(db) });
    c.set("db", prisma);
  }
  return next();
};
