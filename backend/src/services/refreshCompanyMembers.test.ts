import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMembershipCardData,
  firstPrimaryCardTitles,
  loadCompanyMembers,
  memberStatusFromCards,
  refreshCompanyMemberStatuses,
  type CompanyMember,
} from "./peopleVineService";

const COMPANY_ID = "company-1";
const COMPANY_PV_ID = "9423173";

const makeCtx = (members: CompanyMember[] = []) => {
  const findMany = vi.fn(async () => members);
  const updateMany = vi.fn(async () => ({ count: 0 }));
  return { ctx: { get: (key: string) => (key === "db" ? { user: { findMany, updateMany } } : undefined) } as any, findMany, updateMany };
};

const member = (pvId: string, primaryMembership: string | null, primaryMembershipStatus: string | null, active = true): CompanyMember => ({
  id: `user-${pvId}`, email: `${pvId}@example.com`, peopleVineId: pvId, active, primaryMembership, primaryMembershipStatus,
});

const active = (primaryMembership: string) => ({ primaryMembership, primaryMembershipStatus: "Active" as const });
const cancelled = (primaryMembership: string) => ({ primaryMembership, primaryMembershipStatus: "Cancelled" as const });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("memberStatusFromCards — same rule a member's own sync uses", () => {
  const card = (customer_id: number, title: string, primary = true) => ({ id: `${customer_id}-${title}`, customer_id, title, primary, parent_card_id: null });

  it('"Active" when the primary card is in the active scan', () => {
    const cards = [card(9423175, "Garage - Small")];
    expect(memberStatusFromCards("9423175", buildMembershipCardData(cards), firstPrimaryCardTitles(cards))).toEqual(active("Garage - Small"));
  });

  it('"Cancelled" when the primary card only shows up in the any-status scan', () => {
    expect(memberStatusFromCards("9423175", buildMembershipCardData([]), firstPrimaryCardTitles([card(9423175, "Garage - Small")])))
      .toEqual(cancelled("Garage - Small"));
  });

  it("null (left alone) when the member has no primary card — their primary isn't decided by cards", () => {
    expect(memberStatusFromCards("9423175", buildMembershipCardData([]), firstPrimaryCardTitles([card(9423175, "Some Add-on", false)]))).toBeNull();
  });

  it("firstPrimaryCardTitles keeps .find's rule: the first primary card wins, even with a blank title", () => {
    const titles = firstPrimaryCardTitles([card(1, "  "), card(1, "Garage - Small"), card(2, " Office - Small ")]);
    expect(titles.get("1")).toBeNull();
    expect(titles.get("2")).toBe("Office - Small");
  });
});

describe("refreshCompanyMemberStatuses (company webhook → its members)", () => {
  it('flips a reactivated company\'s member from "Cancelled" to "Active" — the 9423173 case', async () => {
    const { ctx, updateMany } = makeCtx();

    const { changes } = await refreshCompanyMemberStatuses(ctx, [member("9423175", "Garage - Small", "Cancelled")], () => active("Garage - Small"));

    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["user-9423175"] } }, data: active("Garage - Small") });
    expect(changes).toEqual([{ email: "9423175@example.com", before: "Garage - Small (Cancelled)", after: "Garage - Small (Active)" }]);
  });

  it("only ever writes the membership name and status — never active/accountStatus", async () => {
    const { ctx, updateMany } = makeCtx();

    await refreshCompanyMemberStatuses(ctx, [member("1", "A", "Cancelled")], () => active("A"));

    expect(Object.keys((updateMany.mock.calls[0] as any)[0].data).sort()).toEqual(["primaryMembership", "primaryMembershipStatus"]);
  });

  it("writes nothing when everyone is already up to date — so duplicate webhooks and retries are no-ops", async () => {
    const { ctx, updateMany } = makeCtx();

    const { changes } = await refreshCompanyMemberStatuses(ctx, [member("1", "A", "Active"), member("2", "B", "Cancelled")], (id) => (id === "1" ? active("A") : null));

    expect(updateMany).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it("batches writes: one query per distinct value, chunked under D1's 100-parameter limit", async () => {
    const { ctx, updateMany } = makeCtx();
    const members = Array.from({ length: 200 }, (_, i) => member(String(i + 1), "Garage - Small", "Cancelled"));

    await refreshCompanyMemberStatuses(ctx, members, () => active("Garage - Small"));

    expect(updateMany).toHaveBeenCalledTimes(3); // 200 ids → chunks of 90, 90, 20
    for (const [args] of updateMany.mock.calls as any[]) expect(args.where.id.in.length).toBeLessThanOrEqual(90);
  });

  it("after a type cascade, restores card titles and logs each member's real previous value", async () => {
    const { ctx, updateMany } = makeCtx();
    // The cascade has already set everyone's primary to the company type ("Office - Large").
    const membersBefore = [member("1", "Garage - Small", "Active"), member("2", "Garage - Small", "Active")];

    const { changes } = await refreshCompanyMemberStatuses(ctx, membersBefore, (id) => (id === "1" ? active("Garage - Small") : null), { value: "Office - Large" });

    // Member 1's card says Garage - Small → written back over the cascade, and nothing to log (net unchanged).
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["user-1"] } }, data: active("Garage - Small") });
    // Member 2 has no primary card → the cascade's value stands, and it's logged against the true previous value.
    expect(changes).toEqual([{ email: "2@example.com", before: "Garage - Small (Active)", after: "Office - Large (Active)" }]);
  });

  it("flags members shown Active who still have access off", async () => {
    const { ctx } = makeCtx();

    const { changes } = await refreshCompanyMemberStatuses(ctx, [member("1", "A", "Cancelled", false)], () => active("A"));

    expect(changes[0].after).toBe("A (Active) — access still off until their own sync");
  });
});

describe("loadCompanyMembers", () => {
  it("only picks inherited members, leaves onboarding/admins/system accounts alone, and drops the company's own record", async () => {
    const { ctx, findMany } = makeCtx([member("1", "A", "Active"), member(COMPANY_PV_ID, "A", "Active")]);

    const members = await loadCompanyMembers(ctx, COMPANY_ID, COMPANY_PV_ID);

    expect(members.map((m) => m.peopleVineId)).toEqual(["1"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: COMPANY_ID,
        memberSource: "membership",
        role: "USER",
        isSystemAccount: false,
        accountStatus: { not: "pending_membership" },
      }),
    }));
  });
});
