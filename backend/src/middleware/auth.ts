import { bearerAuth } from "hono/bearer-auth";
import { verifyToken } from "@/utils/jwt";
import { Context } from "hono";
import { PrismaClient } from "@prisma/client";

const NO_AUTH_PATHS = [
  "/api/user/login",
  "/api/user/register",
  "/api/user/forgot-password",
];
const GET_MY_USER_PATH = "/api/user/me";
const EMAIL_VERIFICATION_PATH = "/api/user/verify-email";
const PASSWORD_RESET_PATH = "/api/user/reset-password";

// These are the only API routes that users with mustResetPassword=true can access
const ALLOWED_PATHS_FOR_LOCKED_USERS = [
  GET_MY_USER_PATH,
  EMAIL_VERIFICATION_PATH,
  PASSWORD_RESET_PATH,
];

export const authMiddleware = async (c: Context, next: () => Promise<any>) => {
  const path = c.req.path;
  if (NO_AUTH_PATHS.some((excludedPath) => path.startsWith(excludedPath))) {
    return next();
  }
  const bearer = bearerAuth({
    verifyToken: async (token, c) => {
      const prisma: PrismaClient = c.get("db");
      try {
        const verified = await verifyToken(token, c.env.JWT_SECRET)
        if (!verified) {
          // Invalid token
          return false
        }
        const payload = JSON.parse(atob(token.split(".")[1]))
        if (!payload.email) {
          // Invalid token payload
          return false
        }
        const user = await prisma.user.findUnique({
          where: { email: payload.email.toLowerCase() },
        });
        if (!user) {
          // User not found
          return false;
        }
        c.set("user", user)
        // Only allow access to the email verification endpoint if the special token given in the email was used
        if (path.startsWith(EMAIL_VERIFICATION_PATH)) {
          return payload.purpose === "email_verification";
        }
        // Only allow access to the password reset endpoint if the special token given in the email was used
        // OR if the user must reset their password
        if (path.startsWith(PASSWORD_RESET_PATH)) {
          return payload.purpose === "password_reset" || user.mustResetPassword;
        }
        if (
          (user.mustResetPassword || user.locked) &&
          !ALLOWED_PATHS_FOR_LOCKED_USERS.some((allowedPath) => path.startsWith(allowedPath))
        ) {
          // Locked users must reset password
          return false;
        }
        if (payload.purpose === "email_verification" || payload.purpose === "password_reset") {
          // Token with special purpose cannot be used for regular authentication
          return false;
        }
        return true;
      } catch (error) {
        return false;
      }
    },
  });
  return bearer(c, next);
};
