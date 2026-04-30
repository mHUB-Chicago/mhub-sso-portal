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
import { syncAll } from "@/services/peopleVineService";
import webhookRoutes from "@/routes/webhook";
import queueConsumer, { JobType } from "./controllers/queueConsumer";
import scheduledHandler from "./controllers/scheduledHandler";
import { markPublic } from "./middleware/markPublic";

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

app.post("/__internal/sync", databaseMiddleware, async (c) => {
  const auth = c.req.header("authorization") ?? "";
  if (auth !== `Bearer ${c.env.SEED_TOKEN}`) return c.json({ success: false }, 401);
  c.executionCtx.waitUntil(syncAll(c));
  return c.json({ success: true, message: "Sync started in background" });
});

export default {
  fetch: app.fetch,
  queue: queueConsumer,
  scheduled: scheduledHandler,
};
