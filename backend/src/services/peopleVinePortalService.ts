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
// PV's CustomerUpdate schema) — this is how PV natively associates a person with a
// company (see e.g. any existing PV contact showing "(view all people at X)" on their
// profile), so there's no separate "company" record to create at all. This ONLY ever
// includes the specific fields being set below, never the full customer object, so a
// call here can't accidentally blank out or overwrite anything else on the PV record.
export const pvUpdateAccountProfile = async (
  c: Context,
  customerId: number,
  input: {
    birthday: string;
    gender: string;
    address: OnboardingFormData["user"]["address"];
    companyName: string;
    companyTitle?: string;
    companyWebsite?: string;
  }
): Promise<unknown> => {
  const body: Record<string, unknown> = {};

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

export interface OnboardingPvPushResult {
  pvCustomerId: string;
}

export const pushOnboardingSubmissionToPeopleVine = async (
  c: Context,
  formData: OnboardingFormData
): Promise<OnboardingPvPushResult> => {
  assertPeopleVineWritesEnabled(c);

  const customer = await pvRegisterCustomer(c, {
    email: formData.user.email,
    firstName: formData.user.firstName,
    lastName: formData.user.lastName,
    phone: formData.user.phone,
    phoneCountryCode: formData.user.phoneCountryCode,
  });

  await pvUpdateAccountProfile(c, customer.id, {
    birthday: formData.user.birthday,
    gender: formData.user.gender,
    address: formData.user.address,
    companyName: formData.company.name,
    companyTitle: formData.user.title,
    companyWebsite: formData.company.website,
  });

  // PV has no API to create a subscription/membership — confirmed platform limitation.
  // The requested membership package (formData.membershipPackage) is intentionally not
  // pushed anywhere here; it stays recorded on the submission itself so mHub staff know
  // which membership to assign manually in the PV Control Panel.
  return {
    pvCustomerId: String(customer.id),
  };
};
