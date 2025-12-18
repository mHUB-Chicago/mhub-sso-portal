import { Role } from "@prisma/client";
import { MiddlewareHandler } from "hono";

export const roleMiddleware = (roles: Role[]): MiddlewareHandler => {
  return async (c, next) => {
    if (roles.length === 0) {
      return next();
    }
    const user = c.get("user");
    if (!user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    if (!roles.includes(user.role as Role)) {
      return c.json({ message: "Forbidden" }, 403);
    }
    return next();
  };
};
