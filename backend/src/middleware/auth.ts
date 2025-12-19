import { User } from "@/database/models";
import { getActiveSessionById } from "@/services/sessionService";
import { Context } from "hono";
import { getCookie } from "hono/cookie";

const COOKIE_NAME = "sid";

export const authMiddleware = async (c: Context, next: () => Promise<any>) => {
  return next();
};

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