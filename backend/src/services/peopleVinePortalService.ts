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

// The onboarding form's fixed-choice fields (schools, degrees, pronouns, ethnicity,
// shop skills, ...) need to offer the exact same option strings as PV's own "Attribute"
// definitions, or a later attribute push would fail to match. GET /account/attributes
// requires an on-behalf-of customer, but the option lists themselves (unlike the
// `selected`/`value` state) are account-wide, not specific to that customer — so any
// existing, synced PV customer works as the lookup anchor. Configured once via
// PEOPLEVINE_ATTRIBUTE_REFERENCE_CUSTOMER_ID rather than picked arbitrarily from the
// local DB, so the anchor is stable and admin-controlled instead of silently shifting
// to whichever record happens to sync first.
export interface PvAttributeOption {
  id: number;
  name: string;
  values: string[];
}

export const fetchPvAttributeOptions = async (c: Context): Promise<PvAttributeOption[]> => {
  const referenceCustomerId = c.env.PEOPLEVINE_ATTRIBUTE_REFERENCE_CUSTOMER_ID;
  if (!referenceCustomerId) {
    throw new HTTPException(500, {
      message:
        "PEOPLEVINE_ATTRIBUTE_REFERENCE_CUSTOMER_ID is not configured — it's needed as a reference customer to look up PV's fixed-choice attribute lists (schools, degrees, pronouns, etc.).",
    });
  }

  const attributes = await pvPortalRequest(c, {
    method: "GET",
    endpoint: "/account/attributes",
    onBehalfOfCustomerId: Number(referenceCustomerId),
  });

  return (attributes as any[])
    .filter((attribute) => Array.isArray(attribute?.field?.values) && attribute.field.values.length > 0)
    .map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      values: attribute.field.values
        .map((option: { value: string }) => option.value)
        .filter((value: string) => value !== ""),
    }));
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
// O=Other) on CustomerUpdate.gender — separate from, and coarser than, the "Gender"
// Attribute (id 572: Male/Female/Nonbinary/Intersex/Other/Choose not to answer...) that
// the onboarding form's dropdown now offers. Map the form's exact dropdown label to the
// closest PV code; anything unrecognized is dropped rather than sent, since a bad enum
// value would fail the whole update.
const GENDER_LABEL_TO_PV_CODE: Record<string, string> = {
  Male: "M",
  Female: "F",
  Nonbinary: "N",
  Intersex: "O",
  Other: "O",
  "Choose not to answer...": "U",
};

// Address/birthdate/gender/company info have no create-time equivalent in PV's register
// schema — PATCH /api/account is the only endpoint that accepts them. `company_name` /
// `company_title` / `website` live directly on the customer's own record (confirmed via
// PV's CustomerUpdate schema). This ONLY ever includes the specific fields being set
// below, never the full customer object, so a call here can't accidentally blank out or
// overwrite anything else on the PV record.
// One PV "Attribute" answer — `name` must match a PV-configured attribute exactly
// (case/spacing and all, e.g. "Ethnicity (choose all that apply)"); `values` is a
// single-item array for single-choice attributes, multi-item for checkbox ones.
export interface PvAttributeInput {
  name: string;
  values: string[];
}

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
    attributes?: PvAttributeInput[];
  }
): Promise<unknown> => {
  const body: Record<string, unknown> = {};

  if (input.type) {
    body.type = input.type;
  }
  if (input.birthday) {
    body.birthdate = input.birthday;
  }
  const genderCode = input.gender ? GENDER_LABEL_TO_PV_CODE[input.gender] : undefined;
  if (genderCode) {
    body.gender = genderCode;
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
  if (input.attributes && input.attributes.length > 0) {
    body.attributes = input.attributes;
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

// Maps our onboarding form's own field names to the exact PV attribute names they were
// built to match (see fetchPvAttributeOptions) — never sends a blank/empty entry, so an
// unanswered field simply doesn't touch that attribute on the PV side (never blanks out
// something already set there from a prior partial submission or manual PV edit).
const buildAttribute = (name: string, values: string[]): PvAttributeInput | null =>
  values.length > 0 ? { name, values } : null;

const buildUserAttributes = (formData: OnboardingFormData): PvAttributeInput[] => {
  const { user, skills } = formData;
  return [
    buildAttribute("Personal Bio", user.bio ? [user.bio] : []),
    buildAttribute("LinkedIn Profile URL", user.linkedin ? [user.linkedin] : []),
    buildAttribute("Pronoun", user.pronouns ? [user.pronouns] : []),
    buildAttribute("Gender", user.gender ? [user.gender] : []),
    buildAttribute("Ethnicity (choose all that apply)", user.ethnicity),
    buildAttribute("Undergraduate Alma Mater", skills.undergradSchool ? [skills.undergradSchool] : []),
    buildAttribute("Primary Undergrad Degree", skills.undergradDegree ? [skills.undergradDegree] : []),
    buildAttribute("Graduate School Alma Mater", skills.gradSchool ? [skills.gradSchool] : []),
    buildAttribute("Primary Graduate School Degree", skills.gradDegree ? [skills.gradDegree] : []),
    buildAttribute("Industry Experience", skills.industryExperience ? [skills.industryExperience] : []),
    buildAttribute("Profession/ Knowledge", skills.skills),
    buildAttribute("Shop Skills", skills.shopSkills),
  ].filter((attribute): attribute is PvAttributeInput => attribute !== null);
};

// Company-side attributes only apply to the new_company scenario, where we already
// create/update the company's own PV customer record below — existing_company never
// touches the already-known company record beyond linking, so it's left alone here too.
const buildCompanyAttributes = (formData: OnboardingFormData): PvAttributeInput[] => {
  const { company } = formData;
  return [
    buildAttribute("Total Number of Employees", company.size ? [company.size] : []),
    buildAttribute("Company Concentration", company.industry ? [company.industry] : []),
    buildAttribute("Business Stage", company.fundingStage ? [company.fundingStage] : []),
  ].filter((attribute): attribute is PvAttributeInput => attribute !== null);
};

// PV requires a unique, non-empty email per customer, but our onboarding form only ever
// collects one email (the person's). The company-type customer still needs its own,
// distinct address — "+company" sub-addressing on the real user's own domain gives it
// one without inventing a fake/undeliverable domain, and any mail providers that support
// it (Gmail, Google Workspace, Outlook, etc.) will still deliver it to the same real
// inbox rather than bouncing. Kept short and constant rather than including the company
// name: if the same person ever onboards a second company, that collides with the first
// company's placeholder in PV (accepted trade-off — this is the rare case, not the norm).
const buildCompanyPlaceholderEmail = (userEmail: string): string => {
  const [localPart, domain] = userEmail.split("@");
  return `${localPart}+company@${domain}`;
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
  const userAttributes = buildUserAttributes(formData);

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
        attributes: userAttributes,
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
      attributes: userAttributes,
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
      email: buildCompanyPlaceholderEmail(formData.user.email),
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
      attributes: buildCompanyAttributes(formData),
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
    attributes: userAttributes,
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
