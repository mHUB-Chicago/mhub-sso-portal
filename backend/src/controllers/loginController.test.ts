import { beforeEach, describe, expect, it, vi } from "vitest";

// Every service the login controller touches is mocked, so these tests exercise only the
// controller's access decisions — plus the real session check (getActiveSessionById),
// which is what rejected Xavier's change-password call with a 401 on 2026-10-06.
vi.mock("@/services/userService", () => ({
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@/services/peopleVineService", () => ({ hasPortalAccess: vi.fn(), hasCompanyPortalAccess: vi.fn() }));
vi.mock("@/services/sessionService", async (importActual) => ({
  ...(await importActual<typeof import("@/services/sessionService")>()),
  createSession: vi.fn(async () => "session-id"),
}));
vi.mock("@/services/loginRequestService", () => ({
  createLoginRequest: vi.fn(async () => ({ id: "real-request-id" })),
  verifyLoginRequest: vi.fn(),
  LoginError: class LoginError extends Error {},
}));
vi.mock("@/services/userServiceProviderService", () => ({ getAllowedServiceProvidersForUser: vi.fn(async () => []) }));
vi.mock("@/services/samlAuthRequestService", () => ({ getSamlAuthRequestById: vi.fn() }));
vi.mock("@/services/serviceProviderService", () => ({ getServiceProviderById: vi.fn() }));
vi.mock("@/middleware/auth", () => ({ getSessionId: vi.fn() }));
vi.mock("@/controllers/onboardingController", () => ({
  getOnboardingPaymentFormUrl: vi.fn(() => "https://pv.example/payment-form"),
  getOnboardingPaymentSsoUrl: vi.fn(async () => "https://pv.example/payment-sso"),
  PEOPLEVINE_HOME_URL: "https://pv.example/home",
  PEOPLEVINE_SP_ENTITY_ID: "pv-entity",
}));

import { handleStartLogin, handleVerifyLogin } from "./loginController";
import { getActiveSessionById, createSession } from "@/services/sessionService";
import { getUserByEmail, getUserById } from "@/services/userService";
import { hasCompanyPortalAccess, hasPortalAccess } from "@/services/peopleVineService";
import { createLoginRequest, verifyLoginRequest } from "@/services/loginRequestService";

const PORTAL_MEMBERSHIP = "Member Plus";

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  companyId: "company-1",
  email: "member@example.com",
  name: "Test Member",
  peopleVineId: null,
  role: "USER",
  active: true,
  emailVerified: true,
  mustResetPassword: false,
  passwordHashed: "hash",
  primaryMembership: PORTAL_MEMBERSHIP,
  primaryMembershipStatus: null,
  addOns: "[]",
  profilePhoto: null,
  phone: null,
  address: null,
  city: null,
  state: null,
  zipCode: null,
  cardStatus: null,
  memberSource: "subscription",
  memberSourceCompany: null,
  accountStatus: "active",
  onboardingPaymentAgreementAt: null,
  membershipAgreementSignedAt: null,
  membershipAgreementSignedName: null,
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
  ...overrides,
});
type TestUser = ReturnType<typeof makeUser>;

// A newly created account: never logged in, so it gets an OTP and is then forced to
// change its password — but `active` is false while it still holds a portal membership.
const XAVIER_LIKE = makeUser({ email: "xavier@example.com", active: false, passwordHashed: null, emailVerified: false, mustResetPassword: true });

const makeCtx = (body: unknown, session?: { user: TestUser }) =>
  ({
    req: { valid: () => body },
    json: (data: any, status = 200) => ({ status, data }),
    env: {},
    get: (key: string) =>
      key === "db"
        ? {
            session: {
              findUnique: async () =>
                session && { ...session, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) },
            },
          }
        : undefined,
  }) as any;

const start = (email: string) => handleStartLogin(makeCtx({ email })) as unknown as Promise<{ status: number; data: any }>;
const verify = () =>
  handleVerifyLogin(makeCtx({ request_id: "real-request-id", password: "otp-or-password" })) as unknown as Promise<{ status: number; data: any }>;

// Mirrors the request that follows login (e.g. POST /api/login/change-password): the
// auth middleware 401s whenever getActiveSessionById returns null.
const sessionAccepts = async (user: TestUser) => (await getActiveSessionById(makeCtx({}, { user }), "session-id")) !== null;

const givenUser = (user: TestUser) => {
  vi.mocked(getUserByEmail).mockResolvedValue(user as any);
  vi.mocked(getUserById).mockResolvedValue(user as any);
  vi.mocked(verifyLoginRequest).mockResolvedValue({ userId: user.id } as any);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(hasPortalAccess).mockImplementation(async (_c, primaryMembership) => primaryMembership === PORTAL_MEMBERSHIP);
  vi.mocked(hasCompanyPortalAccess).mockResolvedValue(false);
});

describe("member whose own card isn't a portal type, under a company that is", () => {
  const KYLE_LIKE = makeUser({ email: "kyle@example.com", primaryMembership: "mHUB Community" });

  it("gets in through the company's membership", async () => {
    givenUser(KYLE_LIKE);
    vi.mocked(hasCompanyPortalAccess).mockResolvedValue(true);

    const res = await verify();

    expect(res.status).toBe(200);
    expect(hasCompanyPortalAccess).toHaveBeenCalledWith(expect.anything(), KYLE_LIKE.companyId);
    expect(createSession).toHaveBeenCalled();
  });

  it("is still blocked when the company doesn't qualify", async () => {
    givenUser(KYLE_LIKE);

    const res = await verify();

    expect(res.status).toBe(403);
    expect(res.data.code).toBe("ACCOUNT_INACTIVE");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("is still blocked when the user is inactive, without checking the company", async () => {
    const inactive = makeUser({ primaryMembership: "mHUB Community", active: false, accountStatus: "membership-removed" });
    givenUser(inactive);
    vi.mocked(hasCompanyPortalAccess).mockResolvedValue(true);

    const res = await verify();

    expect(res.status).toBe(403);
    expect(hasCompanyPortalAccess).not.toHaveBeenCalled();
  });

  it("isn't looked up when the user's own membership already qualifies", async () => {
    givenUser(makeUser());

    const res = await verify();

    expect(res.status).toBe(200);
    expect(hasCompanyPortalAccess).not.toHaveBeenCalled();
  });
});

describe("Xavier's case: active=false but holding a portal-access membership", () => {
  it("the session check rejects this user — why change-password returned 401 right after login", async () => {
    expect(await sessionAccepts(XAVIER_LIKE)).toBe(false);
  });

  it("login refuses them with ACCOUNT_INACTIVE instead of handing out a session that can't be used", async () => {
    givenUser(XAVIER_LIKE);

    const res = await verify();

    expect(res.status).toBe(403);
    expect(res.data).toMatchObject({ success: false, code: "ACCOUNT_INACTIVE", message: "Your account is inactive. Please contact an admin." });
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("inactive member without a portal-access membership", () => {
  const LAPSED = makeUser({ primaryMembership: "Lapsed Plan", accountStatus: "membership-removed" });

  it("gets a real login request (not the fake one that made every password 'incorrect')", async () => {
    givenUser(LAPSED);

    const res = await start(LAPSED.email);

    expect(createLoginRequest).toHaveBeenCalledWith(expect.anything(), { email: LAPSED.email });
    expect(res.data.data.request_id).toBe("real-request-id");
    expect(res.data.data.peopleVineLandingUrl).toBeNull();
  });

  it("sees the inactive message once their password checks out", async () => {
    givenUser(LAPSED);

    const res = await verify();

    expect(res.status).toBe(403);
    expect(res.data.code).toBe("ACCOUNT_INACTIVE");
    expect(createSession).not.toHaveBeenCalled();
  });
});

it("an unknown email still gets a fake request_id, so account status isn't revealed", async () => {
  vi.mocked(getUserByEmail).mockResolvedValue(null);

  const res = await start("nobody@example.com");

  expect(createLoginRequest).not.toHaveBeenCalled();
  expect(res.data.success).toBe(true);
  expect(res.data.data.request_id).not.toBe("real-request-id");
});

// The invariant the bug broke: anyone login hands a session to must be accepted by the
// session check on the very next request. (The reverse needn't hold — login is allowed
// to be stricter, e.g. it also requires a portal-access membership.)
describe.each([
  ["active member", makeUser()],
  ["Xavier-like new account (active=false)", XAVIER_LIKE],
  ["lapsed member (no portal membership)", makeUser({ primaryMembership: "Lapsed Plan" })],
  ["pending_membership onboarding user (active=false)", makeUser({ active: false, accountStatus: "pending_membership", primaryMembership: null })],
  ["admin (active=false)", makeUser({ role: "ADMIN", active: false, primaryMembership: null })],
])("%s", (_label, user) => {
  it("is let in by login only if the session check will accept them", async () => {
    givenUser(user);

    const res = await verify();

    if (res.status === 200) expect(await sessionAccepts(user)).toBe(true);
  });
});
