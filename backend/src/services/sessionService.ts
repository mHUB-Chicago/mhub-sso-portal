import { PrismaClient, Session, User } from "@/database/models";
import { Context } from "hono";
import { setCookie } from "hono/cookie";

const SESSION_EXPIRE_TIME_MS = 24 * 60 * 60 * 1000; // 1 day

const generateSessionId = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export const getActiveSessionById = async (c: Context, sessionId: string): Promise<User | null> => {
  const prisma: PrismaClient = c.get("db");
  const session = await prisma.session.findUnique({
    where: { sessionId },
    include: { user: true },
  });

  // pending_membership users are inactive by definition until they complete onboarding,
  // but still need an authenticated session to reach change-password/the payment form.
  const userAllowed = session?.user.active || session?.user.role === 'ADMIN' || session?.user.accountStatus === 'pending_membership';
  if (!session || session.revokedAt || session.expiresAt < new Date() || !userAllowed) {
    return null;
  }
  return session.user;
}

export const createSession = async (c: Context, userId: string): Promise<string> => {
  const prisma: PrismaClient = c.get("db");
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRE_TIME_MS);

  const createdSession: Session = await prisma.session.create({
    data: {
      sessionId,
      userId,
      expiresAt,
    },
  });
  const createdSessionId = createdSession.sessionId;
  const isLocal = (c.env.DOMAIN as string) === "localhost";
  setCookie(c, "sid", createdSessionId, {
    httpOnly: true,
    // secure: true, // original - use for production
    secure: !isLocal, // local dev fix: false on localhost, true in production
    // sameSite: "Lax", // use when frontend and backend are on same parent domain
    sameSite: "None", // temporary: allows cross-origin cookies between pages.dev and workers.dev
    path: "/",
    domain: c.env.DOMAIN as string
  });
  return createdSessionId;
}

export const revokeSession = async (c: Context, sessionId: string): Promise<void> => {
  const prisma: PrismaClient = c.get("db");
  await prisma.session.update({
    where: { sessionId },
    data: { revokedAt: new Date() },
  });
}