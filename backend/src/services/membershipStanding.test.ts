import { describe, expect, it } from "vitest";
import { hasActiveMembershipStanding, type MembershipStanding } from "./peopleVineService";

const standing = (overrides: Partial<MembershipStanding> = {}): MembershipStanding => ({
  isSubscriber: false,
  isMember: false,
  companyQualifiesForFreeMember: false,
  ...overrides,
});

describe("hasActiveMembershipStanding", () => {
  it("is active for a subscriber tagged as a member whose company does not qualify for free members", () => {
    expect(hasActiveMembershipStanding(standing({ isSubscriber: true, isMember: true }))).toBe(true);
  });

  it("is active for a subscriber who is not tagged as a member", () => {
    expect(hasActiveMembershipStanding(standing({ isSubscriber: true }))).toBe(true);
  });

  it("is active for a member whose company qualifies for free members", () => {
    expect(hasActiveMembershipStanding(standing({ isMember: true, companyQualifiesForFreeMember: true }))).toBe(true);
  });

  it("is inactive for a member without a subscription whose company does not qualify", () => {
    expect(hasActiveMembershipStanding(standing({ isMember: true }))).toBe(false);
  });

  it("is inactive for a non-member without a subscription even when the company qualifies", () => {
    expect(hasActiveMembershipStanding(standing({ companyQualifiesForFreeMember: true }))).toBe(false);
  });

  it("is inactive with no subscription and no membership", () => {
    expect(hasActiveMembershipStanding(standing())).toBe(false);
  });
});
