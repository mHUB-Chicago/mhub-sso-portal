import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { z, ZodType } from "zod";
import { PrismaClient, User } from "@prisma/client";
import { authMiddleware } from "@/middleware/auth";
import { corsMiddleware } from "@/middleware/cors";
import { databaseMiddleware } from "@/middleware/database";
import { handleError } from "@/utils/handleError";
import userRoutes from "@/routes/user";
import seedRoute from "@/database/seed";
import { swaggerUI } from "@hono/swagger-ui";
import queueConsumer from "./controllers/queueConsumer";
import scheduledHandler from "./controllers/scheduledHandler";

type Bindings = {
  DB: D1Database;
  QUEUE: Queue<{ jobId: string; payload: unknown }>;
  [key: string]: string | D1Database | Queue<any>;
};
type Variables = {
  user: User;
  db: PrismaClient;
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

app.get(
  "/openapi.json",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "API",
        version: "1.0.0",
        description: "API Documentation",
      },
    },
  })
);
app.get("/openapi", swaggerUI({ url: "/openapi.json" }));

app.use("/api/*", corsMiddleware, databaseMiddleware, authMiddleware);
app.route("/api/user", userRoutes);

app.route("/__internal/seed", seedRoute);
app.onError(handleError);

export default {
  fetch: app.fetch,
  queue: queueConsumer,
  scheduled: scheduledHandler,
};
