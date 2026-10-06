import { describe, expect, it } from "vitest";
import { canLogIn, hasPortalMembership, loginAccess } from "@common/access";

// The shared login rule (@common/access) drives both login and the admin screens. These
// pin it to the rule login used before it was shared, so the refactor changed nothing.
const PORTAL = new Set(["Garage - Small", "Associate Membership (Sponsorship)"]);
const user = (o: Partial<{ role: string; accountStatus: string; active: boolean }> = {}) =>
  ({ role: "USER", accountStatus: "active", active: true, ...o });

// The pre-refactor rule from loginController.ts, verbatim apart from taking the
// membership check as a boolean: inactive = !ADMIN && !pending && (!active || !portal).
const oldIsInactive = (u: ReturnType<typeof user>, portal: boolean) =>
  u.role !== "ADMIN" && u.accountStatus !== "pending_membership" && (!u.active || !portal);

describe("canLogIn matches the pre-refactor login rule", () => {
  const cases = [
    user(),
    user({ active: false }),
    user({ role: "ADMIN", active: false }),
    user({ accountStatus: "pending_membership", active: false }),
    user({ accountStatus: "membership-removed", active: false }),
  ];
  for (const u of cases) {
    for (const portal of [true, false]) {
      it(`${JSON.stringify(u)} portal=${portal}`, () => {
        expect(canLogIn(u, portal)).toBe(!oldIsInactive(u, portal));
      });
    }
  }
});

describe("hasPortalMembership — same matching as the backend's hasPortalAccess", () => {
  it("matches the primary membership, trimmed (PV titles can carry a trailing space)", () => {
    expect(hasPortalMembership(PORTAL, "Associate Membership (Sponsorship) ")).toBe(true);
  });
  it("matches an add-on", () => {
    expect(hasPortalMembership(PORTAL, "Something Else", JSON.stringify(["Garage - Small"]))).toBe(true);
  });
  it("is false with no match, no membership, or malformed add-ons", () => {
    expect(hasPortalMembership(PORTAL, "Parking, paid for by member", "[]")).toBe(false);
    expect(hasPortalMembership(PORTAL, null, null)).toBe(false);
    expect(hasPortalMembership(PORTAL, null, "not json")).toBe(false);
  });
});

describe("loginAccess — what the admin screens show", () => {
  it("labels admins, onboarding, allowed and blocked users", () => {
    expect(loginAccess(user({ role: "ADMIN", active: false }), false)).toBe("admin");
    expect(loginAccess(user({ accountStatus: "pending_membership", active: false }), false)).toBe("onboarding");
    expect(loginAccess(user(), true)).toBe("allowed");
    // john.michael245's shape: portal-type membership name, but the sync set them inactive.
    expect(loginAccess(user({ active: false, accountStatus: "membership-removed" }), true)).toBe("blocked");
  });
});
