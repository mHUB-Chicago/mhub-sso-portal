import { describe, expect, it } from "vitest";
import { canAttachByEmail, type EmailHolder } from "./peopleVineService";

const holder = (overrides: Partial<EmailHolder> = {}): EmailHolder => ({
  peopleVineId: "1685044",
  active: false,
  accountStatus: "membership-removed",
  ...overrides,
});

describe("canAttachByEmail", () => {
  it("attaches when the account has no PeopleVine id yet", () => {
    expect(canAttachByEmail(holder({ peopleVineId: null }), "2760834", false)).toBe(true);
  });

  it("attaches when the account is already linked to the same record", () => {
    expect(canAttachByEmail(holder({ peopleVineId: "2760834", active: true, accountStatus: "active" }), "2760834", false)).toBe(true);
  });

  it("lets an active record take over an inactive account linked to another record", () => {
    expect(canAttachByEmail(holder(), "2760834", true)).toBe(true);
  });

  it("keeps an active account from being moved to another record", () => {
    const linked = holder({ peopleVineId: "2760834", active: true, accountStatus: "active" });
    expect(canAttachByEmail(linked, "1685044", false)).toBe(false);
    expect(canAttachByEmail(linked, "1685044", true)).toBe(false);
  });

  it("keeps an inactive account from being moved to another inactive record", () => {
    expect(canAttachByEmail(holder(), "2760834", false)).toBe(false);
  });

  it("leaves onboarding accounts on the previous behaviour", () => {
    expect(canAttachByEmail(holder({ accountStatus: "pending_membership" }), "2760834", false)).toBe(true);
  });
});
