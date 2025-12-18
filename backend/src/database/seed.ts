import { PrismaClient } from "@prisma/client";
import { Context } from "hono";
import { Hono } from "hono";
import { AppType } from "@/index";
import { databaseMiddleware } from "@/middleware/database";

const app = new Hono<AppType>();

app.post(
  "/",
  databaseMiddleware,
  async (c) => {
    if (c.env.SEED_ENABLED !== "true") {
      return c.json({ success: false }, 403);
    }
    const auth = c.req.header("authorization") ?? "";
    if (auth !== `Bearer ${c.env.SEED_TOKEN}`) {
      return c.json({ success: false }, 401);
    }
    await runSeed(c);
    return c.json({ success: true });
  }
);

export const runSeed = async (c: Context) => {
  const prisma: PrismaClient = c.get("db");

  // Clear existing data
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  // TODO: Create additional seed data as needed
};

export default app;