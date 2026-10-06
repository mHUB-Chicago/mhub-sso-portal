import { describe, expect, it } from "vitest";
import { decidePeopleVineShortcut } from "./peopleVineSsoShortcut";

const PV = "https://member.mhubchicago.com/";
const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;
const WINDOW = 15 * MIN;
const member = { id: "user-y", accountStatus: "active" };

const decide = (o: Partial<Parameters<typeof decidePeopleVineShortcut>[0]> = {}) =>
  decidePeopleVineShortcut({ spEntityId: PV, user: member, now: NOW, windowMs: WINDOW, ...o });

describe("decidePeopleVineShortcut — skip the re-login only when it's provably the same person", () => {
  it("skips (goes straight to PV) when this same user logged into PV a few minutes ago", () => {
    expect(decide({ lastSso: `user-y:${NOW - 5 * MIN}` })).toBe("skip");
  });

  it("never skips for a different account — they'd land in someone else's PV session", () => {
    expect(decide({ lastSso: `user-x:${NOW - 5 * MIN}` })).toBe("sso");
  });

  it("does a real SSO when there's no record, a garbled one, or one outside the window", () => {
    expect(decide({})).toBe("sso");
    expect(decide({ lastSso: "garbage" })).toBe("sso");
    expect(decide({ lastSso: `user-y:${NOW - WINDOW - 1}` })).toBe("sso");
    expect(decide({ lastSso: `user-y:${NOW + MIN}` })).toBe("sso"); // clock skew / future stamp
  });

  it("leaves onboarding (pending payment) and every other app on the normal SSO", () => {
    expect(decide({ user: { ...member, accountStatus: "pending_membership" }, lastSso: `user-y:${NOW - MIN}` })).toBe("sso");
    expect(decide({ spEntityId: "https://mhub.getlearnworlds.com", lastSso: `user-y:${NOW - MIN}` })).toBe("sso");
  });

  it("falls back to a real SSO if a shortcut just bounced them back (PV's own session had ended)", () => {
    expect(decide({ lastSso: `user-y:${NOW - 5 * MIN}`, lastSkip: `user-y:${NOW - 20 * 1000}` })).toBe("sso");
    // An older skip doesn't block the next one.
    expect(decide({ lastSso: `user-y:${NOW - 5 * MIN}`, lastSkip: `user-y:${NOW - 2 * MIN}` })).toBe("skip");
  });

  it("is off when the window is 0", () => {
    expect(decide({ lastSso: `user-y:${NOW - MIN}`, windowMs: 0 })).toBe("sso");
  });

  it("handles user ids that contain colons", () => {
    expect(decide({ user: { ...member, id: "a:b" }, lastSso: `a:b:${NOW - MIN}` })).toBe("skip");
  });
});
