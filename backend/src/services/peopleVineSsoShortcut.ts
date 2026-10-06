import { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { PEOPLEVINE_SP_ENTITY_ID } from "@/controllers/onboardingController";

// PeopleVine's own cookies (ASP.NET_SessionId, ARRAffinity, domain, companyMain, …) carry no
// SameSite attribute, so Chrome treats them as Lax and only sends them on a cross-site POST
// for 2 minutes after they're set. Our SAML Response reaches PV as exactly that — a
// cross-site POST to /login/sso — so any SSO into PV more than ~2 minutes after the browser's
// previous PV login arrives with a partial cookie set, and PV's server fails it with a 502
// (reproduced 2026-10-06: login → wait 2.5 min → login again → 502, every time; a fresh
// browser or a re-login inside 2 minutes works). Only PeopleVine can fix the cookies.
//
// What we can do: not send a second login when the browser is almost certainly still logged
// into PV *as this same user*. After a real SSO into PV we remember (user, time) in a cookie
// on our own domain; when that same user asks for PV again within the window, we send them
// straight to PV instead of issuing a new assertion — no POST, no 502. Anything else (another
// account, an older login, no record) gets the normal SSO, so the shortcut can never land
// someone in a different person's PV session.

const LAST_SSO_COOKIE = "pv_sso";
const LAST_SKIP_COOKIE = "pv_sso_skip";
// If a shortcut didn't get the user in (PV's own session had already ended) they come
// straight back; within this window we do the real SSO instead of bouncing them again.
const SKIP_RETRY_MS = 60 * 1000;
const DEFAULT_WINDOW_MINUTES = 15;

const PEOPLEVINE_ROOT_URL = PEOPLEVINE_SP_ENTITY_ID; // "https://member.mhubchicago.com/"

type ShortcutUser = { id: string; accountStatus: string };

const parseStamp = (value: string | undefined): { userId: string; at: number } | null => {
  if (!value) return null;
  const sep = value.lastIndexOf(":");
  if (sep <= 0) return null;
  const at = Number(value.slice(sep + 1));
  return Number.isFinite(at) ? { userId: value.slice(0, sep), at } : null;
};

export const decidePeopleVineShortcut = (input: {
  spEntityId: string;
  user: ShortcutUser;
  lastSso?: string;
  lastSkip?: string;
  now: number;
  windowMs: number;
}): "skip" | "sso" => {
  const { spEntityId, user, now, windowMs } = input;
  if (spEntityId !== PEOPLEVINE_SP_ENTITY_ID || windowMs <= 0) return "sso";
  // Onboarding logs into PV under the Company's identity to reach the payment form —
  // left exactly as it was.
  if (user.accountStatus === "pending_membership") return "sso";
  const lastSso = parseStamp(input.lastSso);
  if (!lastSso || lastSso.userId !== user.id) return "sso";
  const age = now - lastSso.at;
  if (age < 0 || age > windowMs) return "sso";
  const lastSkip = parseStamp(input.lastSkip);
  if (lastSkip && lastSkip.userId === user.id && now - lastSkip.at >= 0 && now - lastSkip.at < SKIP_RETRY_MS) return "sso";
  return "skip";
};

const cookieOptions = (c: Context, maxAgeSeconds?: number) => ({
  httpOnly: true,
  secure: (c.env.DOMAIN as string) !== "localhost",
  sameSite: "Lax" as const,
  path: "/",
  domain: c.env.DOMAIN as string,
  ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
});

// PV_SSO_SHORTCUT_MINUTES overrides the window; "0" turns the shortcut off.
const windowMs = (c: Context): number => {
  const raw = c.env.PV_SSO_SHORTCUT_MINUTES as string | undefined;
  const minutes = raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : DEFAULT_WINDOW_MINUTES;
  return minutes * 60 * 1000;
};

// Returns a redirect straight to PV when the shortcut applies, or null to carry on with the
// normal SSO. Call before issuing a SAML Response.
export const peopleVineShortcut = (c: Context, spEntityId: string, user: ShortcutUser): Response | null => {
  const now = Date.now();
  const decision = decidePeopleVineShortcut({
    spEntityId,
    user,
    lastSso: getCookie(c, LAST_SSO_COOKIE),
    lastSkip: getCookie(c, LAST_SKIP_COOKIE),
    now,
    windowMs: windowMs(c),
  });
  if (decision !== "skip") return null;
  setCookie(c, LAST_SKIP_COOKIE, `${user.id}:${now}`, cookieOptions(c, SKIP_RETRY_MS / 1000));
  return c.redirect(PEOPLEVINE_ROOT_URL);
};

// Call after issuing a real SAML Response to PeopleVine.
export const recordPeopleVineSso = (c: Context, spEntityId: string, user: ShortcutUser): void => {
  if (spEntityId !== PEOPLEVINE_SP_ENTITY_ID || user.accountStatus === "pending_membership") return;
  setCookie(c, LAST_SSO_COOKIE, `${user.id}:${Date.now()}`, cookieOptions(c, Math.ceil(windowMs(c) / 1000)));
  deleteCookie(c, LAST_SKIP_COOKIE, cookieOptions(c));
};

// Portal logout: forget the PV login so the next person on this browser gets a real SSO.
export const clearPeopleVineSso = (c: Context): void => {
  deleteCookie(c, LAST_SSO_COOKIE, cookieOptions(c));
  deleteCookie(c, LAST_SKIP_COOKIE, cookieOptions(c));
};
