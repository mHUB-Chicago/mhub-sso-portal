import type { Context, Env } from "hono";
import { AppType } from "..";
import { getPrisma } from "@/middleware/database";

export const createMockContext = (env: any, ctx: ExecutionContext): Context<AppType> => {
  let dbBinding = env.DB as D1Database;
  if (!dbBinding) {
    throw new Error("D1 database not found");
  }
  const db = getPrisma(dbBinding);
  return {
    env: env as AppType["Bindings"],
    executionCtx: ctx,
    get: (key: keyof AppType["Variables"]) => {
      return ({
        db: db,
        user: null,
      })[key];
    },
  } as unknown as Context<AppType>;
};
