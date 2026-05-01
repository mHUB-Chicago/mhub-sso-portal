import { User } from "@/database/models";
import { getActiveSessionById } from "@/services/sessionService";
import { Context } from "hono";
import { getCookie } from "hono/cookie";

const COOKIE_NAME = "sid";

export const authMiddleware = async (c: Context, next: () => Promise<any>) => {
  if (c.get("skipAuth")) {
    return next();
  }
  const sessionId = getSessionId(c);
  if (sessionId) {
    const user = await getActiveSessionById(c, sessionId);
    if (user) {
      c.set("user", user);
    } else {
      // Invalid session, reject 
      return c.json({ success: false, message: "Unauthorized" }, 401);
    }
  } else {
    // No session, reject
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }
  return next();
};

export const getSessionId = (c: Context): string | null => {
  const cookie = getCookie(c, COOKIE_NAME);
  if (cookie) return cookie;
  const auth = c.req.header("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7) || null;
  return null;
}

export const verifySession = async (c: Context): Promise<User | null> => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) {
    return null;
  }
  const userByActiveSession = await getActiveSessionById(c, sessionId);
  if (!userByActiveSession) {
    return null;
  } else {
    return userByActiveSession;
  }
}