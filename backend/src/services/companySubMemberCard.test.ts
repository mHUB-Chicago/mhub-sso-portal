import { describe, expect, it } from "vitest";
import { buildMembershipCardData, holdsCompanySubMemberCard, type SubMemberCompany } from "./peopleVineService";

const COMPANY_PV_ID = "6265869";
const MEMBER_PV_ID = "2049879";

const company = (overrides: Partial<SubMemberCompany> = {}): SubMemberCompany => ({
  name: "Fluxion Technologies",
  peopleVineId: COMPANY_PV_ID,
  active: true,
  membershipTypes: JSON.stringify(["Reserved Desk"]),
  ...overrides,
});

const companyCard = { id: 100, customer_id: Number(COMPANY_PV_ID), title: "Reserved Desk", parent_card_id: 0, primary: true, customer_company_name: "Fluxion Technologies" };
const subMemberCard = { id: 101, customer_id: Number(MEMBER_PV_ID), title: "Reserved Desk", parent_card_id: 100, primary: true, customer_company_name: "Fluxion Technologies" };
const ownCommunityCard = { id: 102, customer_id: Number(MEMBER_PV_ID), title: "mHUB Community", parent_card_id: 0, primary: false, customer_company_name: "Fluxion Technologies" };

const cardsOf = (cards: any[], pvId: string) => buildMembershipCardData(cards)[pvId]?.secondaryProviders ?? [];

describe("buildMembershipCardData", () => {
  it("records which customer owns the parent card of a sub-member card", () => {
    expect(cardsOf([companyCard, subMemberCard], MEMBER_PV_ID)).toEqual([
      { title: "Reserved Desk", providingCompanyName: "Fluxion Technologies", providingCustomerId: COMPANY_PV_ID },
    ]);
  });
});

describe("holdsCompanySubMemberCard", () => {
  it("is true for a sub-member card under the company's own card", () => {
    expect(holdsCompanySubMemberCard(cardsOf([companyCard, subMemberCard, ownCommunityCard], MEMBER_PV_ID), company())).toBe(true);
  });

  it("is false for a person with no card under the company", () => {
    expect(holdsCompanySubMemberCard(cardsOf([companyCard, ownCommunityCard], MEMBER_PV_ID), company())).toBe(false);
    expect(holdsCompanySubMemberCard([], company())).toBe(false);
  });

  it("is false when the company is inactive", () => {
    expect(holdsCompanySubMemberCard(cardsOf([companyCard, subMemberCard], MEMBER_PV_ID), company({ active: false }))).toBe(false);
  });

  it("is false when the card is not one of the company's membership types", () => {
    const types = JSON.stringify(["Office - Small"]);
    expect(holdsCompanySubMemberCard(cardsOf([companyCard, subMemberCard], MEMBER_PV_ID), company({ membershipTypes: types }))).toBe(false);
  });

  it("is false when the parent card belongs to a different company", () => {
    const otherCompany = company({ name: "Orbital Transports", peopleVineId: "874584" });
    expect(holdsCompanySubMemberCard(cardsOf([companyCard, subMemberCard], MEMBER_PV_ID), otherCompany)).toBe(false);
  });

  it("matches the company by PeopleVine id when the card carries a different company name", () => {
    const renamedParent = { ...companyCard, customer_company_name: "Fluxion Technologies LLC" };
    expect(holdsCompanySubMemberCard(cardsOf([renamedParent, subMemberCard], MEMBER_PV_ID), company())).toBe(true);
  });

  it("matches the company by name when the company has no PeopleVine id", () => {
    const cards = cardsOf([companyCard, subMemberCard], MEMBER_PV_ID);
    expect(holdsCompanySubMemberCard(cards, company({ peopleVineId: null, name: "  fluxion technologies " }))).toBe(true);
  });
});
