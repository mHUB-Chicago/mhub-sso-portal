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

// Address/birthdate/gender have no create-time equivalent in PV's register schema —
// PATCH /api/account is the only endpoint that accepts them. This ONLY ever includes
// the specific fields being set below, never the full customer object, so a call here
// can't accidentally blank out or overwrite anything else on the PV record.
export const pvUpdateAccountProfile = async (
  c: Context,
  customerId: number,
  input: { birthday: string; gender: string; address: OnboardingFormData["user"]["address"] }
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

export const pvAddToCart = async (
  c: Context,
  customerId: number,
  productId: number,
  quantity = 1
): Promise<unknown> => {
  return pvPortalRequest(c, {
    method: "POST",
    endpoint: "/cart/products",
    onBehalfOfCustomerId: customerId,
    body: { id: productId, quantity },
  });
};

// PV's checkout requires a tokenized payment method (`PaymentMethod.id`), not a raw
// card/account number — and this codebase intentionally never collects/forwards raw
// card data (see OnboardingBillingSchema, which only keeps `cardLast4`). Which
// processor PV tokenizes staff/admin-entered cards through is still unconfirmed
// (open item from the original onboarding plan), so this throws instead of
// fabricating a payload PV would reject anyway. Wire in the real token source here
// once that's confirmed.
export const pvCheckout = async (
  _c: Context,
  _customerId: number,
  _billing: OnboardingFormData["billing"]
): Promise<never> => {
  throw new HTTPException(501, {
    message:
      "PeopleVine checkout is not wired yet — card tokenization processor for admin-entered payments is unconfirmed. See onboarding plan notes.",
  });
};

interface PvSubMember {
  customer_id: number;
}

export const pvGetMembershipCardId = async (c: Context, customerId: number): Promise<string> => {
  const result = await pvPortalRequest(c, {
    method: "GET",
    endpoint: "/memberships/members",
    queryParams: { Customer_Id: String(customerId) },
  });
  const members: (PvSubMember & { id?: number })[] = Array.isArray(result) ? result : result?.data ?? [];
  const match = members.find((m) => m.customer_id === customerId && m.id != null);
  if (!match?.id) {
    throw new HTTPException(502, {
      message: `[PeopleVinePortal] No membership card found for customer ${customerId}`,
    });
  }
  return String(match.id);
};

interface PvSubMembershipCard {
  id: number;
  customer_id: number;
}

export const pvAttachCompanyMember = async (
  c: Context,
  membershipCardId: string,
  company: { name: string; website?: string }
): Promise<PvSubMembershipCard> => {
  return pvPortalRequest(c, {
    method: "POST",
    endpoint: `/account/memberships/${membershipCardId}/members`,
    body: {
      type: "company",
      company_name: company.name,
      ...(company.website ? { website: company.website } : {}),
    },
  });
};

export interface OnboardingPvPushResult {
  pvCustomerId: string;
  pvMembershipCardId: string | null;
  warning?: string;
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
  });

  const productId = parseInt(formData.membershipPackage, 10);
  if (Number.isNaN(productId)) {
    // Customer + profile are already created in PV at this point — that's a real,
    // partial success worth keeping, not a reason to fail the whole approval. Skip
    // cart/checkout/company-attach (there's no package to sell) and surface this as
    // a warning on the result instead of throwing.
    const warning = `Membership package is missing or invalid ("${formData.membershipPackage}") — customer was created in PeopleVine, but no package/company was attached. Pick a package and approve again to finish.`;
    console.warn(`[PeopleVinePortal] ${warning}`);
    return {
      pvCustomerId: String(customer.id),
      pvMembershipCardId: null,
      warning,
    };
  }
  await pvAddToCart(c, customer.id, productId);
  await pvCheckout(c, customer.id, formData.billing);

  const membershipCardId = await pvGetMembershipCardId(c, customer.id);
  await pvAttachCompanyMember(c, membershipCardId, {
    name: formData.company.name,
    website: formData.company.website,
  });

  return {
    pvCustomerId: String(customer.id),
    pvMembershipCardId: membershipCardId,
  };
};
