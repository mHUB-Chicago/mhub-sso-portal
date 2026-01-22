import type { Context, Next } from "hono";

export const markPublic = async (c: Context, next: Next) => {
  c.set("skipAuth", true);
  return next();
};