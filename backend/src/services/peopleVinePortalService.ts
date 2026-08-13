import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getUserCompanyToken, PEOPLEVINE_API_BASE_URL } from "./peopleVineService";
import type { OnboardingFormData } from "@common/schemas/onboarding";

// This is a SEPARATE, write-capable PeopleVine (PV) client. It does not touch the
// read-only-guarded `apiRequest`/`apiRequestWithPagination` helpers in
// `peopleVineService.ts`, which stay exactly as-is for the existing sync jobs.
//
// Every exported function here is gated by PEOPLEVINE_WRITE_ENABLED. Until that env
// var is explicitly set to "true" (never by this codebase's defaults), every call
// throws before making any network request to PV.

export const assertPeopleVineWritesEnabled = (c: Context): void => {
  if (c.env.PEOPLEVINE_WRITE_ENABLED !== "true") {
    throw new HTTPException(403, {
      message: "PeopleVine writes are disabled (PEOPLEVINE_WRITE_ENABLED not set).",
    });
  }
};

interface PvPortalRequestOptions {
  // PATCH is intentionally scoped to `pvUpdateAccountProfile` below, which only ever
  // sends the specific fields it's setting — never a full-object update. Do not add
  // a new PATCH call elsewhere without the same discipline (partial body only, never
  // "get the record then PATCH the whole thing back").
  method: "GET" | "POST" | "PATCH";
  endpoint: string;
  body?: unknown;
  onBehalfOfCustomerId?: number;
  queryParams?: Record<string, string>;
}

const pvPortalRequest = async (c: Context, options: PvPortalRequestOptions): Promise<any> => {
  assertPeopleVineWritesEnabled(c);
  const { method, endpoint, body, onBehalfOfCustomerId, queryParams } = options;

  const token = await getUserCompanyToken(c);
  const queryString = queryParams ? "?" + new URLSearchParams(queryParams).toString() : "";
  const fullUrl = `${PEOPLEVINE_API_BASE_URL}${endpoint}${queryString}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
  };
  if (onBehalfOfCustomerId != null) {
    headers["PV.On_Behalf_Of"] = String(onBehalfOfCustomerId);
  }

  console.log(`[PeopleVinePortal] ${method} ${fullUrl}`);
  const response = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const resText = await response.text();
    let errorDetails = resText;
    try {
      errorDetails = JSON.stringify(JSON.parse(resText), null, 2);
    } catch { }
    throw new HTTPException(502, {
      message: `[PeopleVinePortal] ${method} ${endpoint} failed with status ${response.status}: ${errorDetails}`,
    });
  }
  return response.json();
};

interface PvRegisteredCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export const pvRegisterCustomer = async (
  c: Context,
  input: { email: string; firstName: string; lastName: string; phone?: string; phoneCountryCode?: string }
): Promise<PvRegisteredCustomer> => {
  // Admin-created accounts have no member-supplied password; PV's own reset/invite
  // flow is expected to hand the member control of the account afterward.
  const placeholderPassword = crypto.randomUUID();
  // PV rejects `mobile` without an explicit country code (Mobile.Country_Code is
  // required) — the form captures it as its own field rather than guessing it from
  // the phone string or the address country.
  const mobile =
    input.phone && input.phoneCountryCode
      ? { country_code: input.phoneCountryCode, number: input.phone }
      : undefined;
  return pvPortalRequest(c, {
    method: "POST",
    endpoint: "/account/register",
    body: {
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      password: placeholderPassword,
      // `mobile` is part of CustomerRegister itself, so this rides along with the
      // same create call instead of a separate update-method request.
      ...(mobile ? { mobile } : {}),
    },
  });
};

// PV's own gender enum (U=Unspecified, F=Female, M=Male, T=Transgender, N=Non-binary,
// O=Other). Our form field is freeform text, so only forward it when it actually
// matches — otherwise the whole update would fail over an unrelated typo.
const PV_GENDER_CODES = new Set(["U", "F", "M", "T", "N", "O"]);

// Address/birthdate/gender/company info have no create-time equivalent in PV's register
// schema — PATCH /api/account is the only endpoint that accepts them. `company_name` /
// `company_title` / `website` live directly on the customer's own record (confirmed via
// PV's CustomerUpdate schema). This ONLY ever includes the specific fields being set
// below, never the full customer object, so a call here can't accidentally blank out or
// overwrite anything else on the PV record.
export const pvUpdateAccountProfile = async (
  c: Context,
  customerId: number,
  input: {
    type?: "company" | "customer";
    birthday?: string;
    gender?: string;
    address?: OnboardingFormData["user"]["address"];
    companyName?: string;
    companyTitle?: string;
    companyWebsite?: string;
    customerReference?: string;
  }
): Promise<unknown> => {
  const body: Record<string, unknown> = {};

  if (input.type) {
    body.type = input.type;
  }
  if (input.birthday) {
    body.birthdate = input.birthday;
  }
  const normalizedGender = input.gender?.trim().toUpperCase();
  if (normalizedGender && PV_GENDER_CODES.has(normalizedGender)) {
    body.gender = normalizedGender;
  }
  const { street, city, state, zip, country } = input.address ?? {};
  if (street || city || state || zip || country) {
    body.address = { address: street, city, state, zip_code: zip, country };
  }
  if (input.companyName) {
    body.company_name = input.companyName;
  }
  if (input.companyTitle) {
    body.company_title = input.companyTitle;
  }
  if (input.companyWebsite) {
    body.website = input.companyWebsite;
  }
  if (input.customerReference) {
    body.customer_reference = input.customerReference;
  }

  if (Object.keys(body).length === 0) {
    return null;
  }

  return pvPortalRequest(c, {
    method: "PATCH",
    endpoint: "/account",
    onBehalfOfCustomerId: customerId,
    body,
  });
};

// PV's `/account/memberships` "List Memberships" endpoint, called on-behalf-of a
// customer, returns that customer's own membership cards. Used to find an existing
// company's active card so a new user can be attached to it as a real, linked sub
// member — the only native FK PV offers between two Customer rows.
const pvFindActiveMembershipCardId = async (c: Context, companyCustomerId: number): Promise<number | null> => {
  const cards = await pvPortalRequest(c, {
    method: "GET",
    endpoint: "/account/memberships",
    onBehalfOfCustomerId: companyCustomerId,
    queryParams: { Status: "active" },
  });
  if (!Array.isArray(cards) || cards.length === 0) {
    return null;
  }
  const primary = cards.find((card: any) => card.primary);
  return (primary ?? cards[0]).id ?? null;
};

// "Add Sub Member" — attaches a brand-new customer to an existing membership card.
// This is the one PV-documented way to create a customer with a genuine, PV-side link
// back to another customer (here, the company). Falls back to plain register+patch
// (best-effort `customer_reference` link only) when the company has no active card yet.
const pvAddSubMember = async (
  c: Context,
  membershipCardId: number,
  input: { email: string; firstName: string; lastName: string; companyName?: string; companyTitle?: string }
): Promise<PvRegisteredCustomer> => {
  return pvPortalRequest(c, {
    method: "POST",
    endpoint: `/account/memberships/${membershipCardId}/members`,
    body: {
      type: "customer",
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      password: crypto.randomUUID(),
      ...(input.companyName ? { company_name: input.companyName } : {}),
      ...(input.companyTitle ? { company_title: input.companyTitle } : {}),
    },
  });
};

// PV requires a unique, non-empty email per customer, but our onboarding form only ever
// collects one email (the person's). The company-type customer still needs its own,
// distinct address — "+tag" sub-addressing on the real user's own domain guarantees
// uniqueness per company without inventing a fake/undeliverable domain, and any mail
// providers that support it (Gmail, Google Workspace, Outlook, etc.) will still deliver
// it to the same real inbox rather than bouncing.
const buildCompanyPlaceholderEmail = (userEmail: string, companyName: string): string => {
  const [localPart, domain] = userEmail.split("@");
  const slug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
  return `${localPart}+company-${slug}@${domain}`;
};

export interface OnboardingPvPushResult {
  // Set only for the new_company scenario — the PV customer created to represent the
  // company itself (type: "company").
  companyPvCustomerId: string | null;
  // The PV customer created for the actual person being onboarded.
  userPvCustomerId: string;
  // True when the user was attached to the company's PV membership card via Add Sub
  // Member (a real PV-side link). False means the best-effort `customer_reference`
  // link was used instead (new company, or an existing company with no active card).
  linkedViaMembershipCard: boolean;
}

export interface PushOnboardingSubmissionOptions {
  // existing_company scenario: the local Company's already-known PV customer id.
  existingCompanyPeopleVineId?: string | null;
  // new_company scenario: a PV company customer id from a previous, partially-failed
  // Approve attempt. When set, registration of the company customer is skipped
  // entirely and this id is reused, so a retry never creates a second, duplicate
  // company customer in PV.
  resumeCompanyPvCustomerId?: string | null;
  // new_company scenario: called immediately after the company customer is created in
  // PV — before the (separately failure-prone) user registration is attempted — so the
  // caller can persist it right away and make the above resume path possible.
  onCompanyCreated?: (companyPvCustomerId: string) => Promise<void>;
}

export const pushOnboardingSubmissionToPeopleVine = async (
  c: Context,
  formData: OnboardingFormData,
  options: PushOnboardingSubmissionOptions = {}
): Promise<OnboardingPvPushResult> => {
  assertPeopleVineWritesEnabled(c);
  const { existingCompanyPeopleVineId, resumeCompanyPvCustomerId, onCompanyCreated } = options;

  if (formData.scenario === "existing_company") {
    const companyPvId = existingCompanyPeopleVineId ? Number(existingCompanyPeopleVineId) : null;
    const membershipCardId = companyPvId ? await pvFindActiveMembershipCardId(c, companyPvId) : null;

    if (membershipCardId) {
      const subMember = await pvAddSubMember(c, membershipCardId, {
        email: formData.user.email,
        firstName: formData.user.firstName,
        lastName: formData.user.lastName,
        companyTitle: formData.user.title,
      });
      await pvUpdateAccountProfile(c, subMember.id, {
        birthday: formData.user.birthday,
        gender: formData.user.gender,
        address: formData.user.address,
      });
      return { companyPvCustomerId: null, userPvCustomerId: String(subMember.id), linkedViaMembershipCard: true };
    }

    // No active PV membership card found for this company (or it has no PV record at
    // all yet) — fall back to a standalone customer, best-effort linked by name only.
    // The caller records a resolutionNote so staff know to attach it manually in PV.
    const user = await pvRegisterCustomer(c, {
      email: formData.user.email,
      firstName: formData.user.firstName,
      lastName: formData.user.lastName,
      phone: formData.user.phone,
      phoneCountryCode: formData.user.phoneCountryCode,
    });
    await pvUpdateAccountProfile(c, user.id, {
      birthday: formData.user.birthday,
      gender: formData.user.gender,
      address: formData.user.address,
      companyTitle: formData.user.title,
      ...(companyPvId ? { customerReference: `pv_company:${companyPvId}` } : {}),
    });
    return { companyPvCustomerId: null, userPvCustomerId: String(user.id), linkedViaMembershipCard: false };
  }

  // new_company: register two distinct PV customers (company + user) — there's no PV
  // API to create a subscription/membership card up front, so Add Sub Member isn't
  // available here; the link back to the company is best-effort via customer_reference.
  const companyName = formData.company.name ?? "";
  let companyId: number;
  if (resumeCompanyPvCustomerId) {
    companyId = Number(resumeCompanyPvCustomerId);
  } else {
    const company = await pvRegisterCustomer(c, {
      email: buildCompanyPlaceholderEmail(formData.user.email, companyName),
      firstName: companyName,
      lastName: "Company",
    });
    await pvUpdateAccountProfile(c, company.id, {
      type: "company",
      companyName,
      companyWebsite: formData.company.website,
      // The onboarding form has no separate "company address" field — reusing the
      // primary user's address here avoids leaving PV's Location column blank (it
      // renders as a bare "," when address/city/state are all empty) for a company
      // that, at this stage, has no address of its own.
      address: formData.user.address,
    });
    companyId = company.id;
    // Persisted immediately — if the user registration below fails, a retry must not
    // register a second company customer in PV.
    await onCompanyCreated?.(String(companyId));
  }

  const user = await pvRegisterCustomer(c, {
    email: formData.user.email,
    firstName: formData.user.firstName,
    lastName: formData.user.lastName,
    phone: formData.user.phone,
    phoneCountryCode: formData.user.phoneCountryCode,
  });
  await pvUpdateAccountProfile(c, user.id, {
    birthday: formData.user.birthday,
    gender: formData.user.gender,
    address: formData.user.address,
    companyName,
    companyTitle: formData.user.title,
    companyWebsite: formData.company.website,
    customerReference: `pv_company:${companyId}`,
  });

  // PV has no API to create a subscription/membership — confirmed platform limitation.
  // The requested membership package (formData.membershipPackage) is intentionally not
  // pushed anywhere here; it stays recorded on the submission itself so mHub staff know
  // which membership to assign manually in the PV Control Panel.
  return {
    companyPvCustomerId: String(companyId),
    userPvCustomerId: String(user.id),
    linkedViaMembershipCard: false,
  };
};
