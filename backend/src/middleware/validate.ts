import { validator as zValidator } from "hono-openapi";
import { Context } from "hono";
import { ZodError, ZodType } from "zod";

export const validate = (schema: ZodType, target?: "json" | "form" | "query") => async (c: Context, next: () => Promise<any>) => {
  return zValidator(target ?? "json", schema, (result: any) => {
    if (result.error) {
      const zodError: ZodError = new ZodError(result.error);
      throw zodError;
    }
  })(c, next);
};
