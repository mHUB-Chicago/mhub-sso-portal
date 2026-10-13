import { describe, expect, it } from "vitest";
import { replacesCompanyWithSameName, type NamedCompany } from "./peopleVineService";

const company = (overrides: Partial<NamedCompany> = {}): NamedCompany => ({
  active: true,
  peopleVineId: "9281395",
  ...overrides,
});

describe("replacesCompanyWithSameName", () => {
  it("replaces an inactive company with an active one", () => {
    expect(replacesCompanyWithSameName(company({ active: false, peopleVineId: "9278501" }), company())).toBe(true);
  });

  it("keeps an active company over an inactive one", () => {
    expect(replacesCompanyWithSameName(company(), company({ active: false, peopleVineId: "9278501" }))).toBe(false);
  });

  it("keeps an active company without a PeopleVine id over an inactive one that has it", () => {
    expect(replacesCompanyWithSameName(company({ peopleVineId: null }), company({ active: false }))).toBe(false);
  });

  it("prefers the company with a PeopleVine id when both have the same status", () => {
    expect(replacesCompanyWithSameName(company({ peopleVineId: null }), company())).toBe(true);
    expect(replacesCompanyWithSameName(company(), company({ peopleVineId: null }))).toBe(false);
  });

  it("keeps the first company when neither is preferred", () => {
    expect(replacesCompanyWithSameName(company(), company({ peopleVineId: "9278501" }))).toBe(false);
  });
});
