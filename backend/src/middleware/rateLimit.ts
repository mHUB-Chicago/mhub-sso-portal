import type { Context, Next } from "hono";
import { AppType } from "..";
import { FailedResponseSchema } from "@common/schemas/response";

export const loginRateLimit = async (c: Context<AppType>, next: Next) => {
  const limiter = c.env.LOGIN_RATE_LIMITER as RateLimit | undefined;
  if (!limiter) return next();
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key: `${c.req.path}:${ip}` });
  if (success) return next();
  const response = FailedResponseSchema.parse({
    success: false,
    message: "Too many attempts. Please wait a minute and try again.",
    code: "RATE_LIMITED",
  });
  return c.json(response, 429);
};
