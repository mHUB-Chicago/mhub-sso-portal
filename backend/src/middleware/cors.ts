import { Context } from "hono";
import { cors } from "hono/cors";

export const corsOptions = {
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  allowCredentials: true,
};

export const corsMiddleware = async (c: Context, next: () => Promise<any>) => {
  return cors({
    origin: c.env.CORS_ORIGIN,
    ...corsOptions,
  })(c, next);
};
