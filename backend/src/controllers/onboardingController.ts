import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { PrismaClient } from "@prisma/client";
import { AppType, JsonInput, QueryInput } from "..";
import {
  ApplyOnboardingSubscriptionResponseSchema,
  SkipOnboardingPaymentResponseSchema,
  ApproveOnboardingSubmissionResponseSchema,
  CompleteOnboardingSubmissionResponseSchema,
  GetOnboardingAddonPackagesResponseSchema,
  CreateOnboardingLinkRequestSchema,
  CreateOnboardingLinkResponseSchema,
  CreateOnboardingSubmissionRequestSchema,
  CreateOnboardingSubmissionResponseSchema,
  DisapproveOnboardingSubmissionRequestSchema,
  DisapproveOnboardingSubmissionResponseSchema,
  FlagOnboardingSubmissionRequestSchema,
  FlagOnboardingSubmissionResponseSchema,
  GetOnboardingAttributeOptionsResponseSchema,
  GetOnboardingInProcessResponseSchema,
  GetOnboardingMembershipPackagesResponseSchema,
  GetOnboardingSubmissionResponseSchema,
  GetOnboardingSubmissionsQuerySchema,
  GetOnboardingSubmissionsResponseSchema,
  ReactivateOnboardingSubmissionResponseSchema,
  SendOnboardingLinkEmailRequestSchema,
  SendOnboardingLinkEmailResponseSchema,
  TreatOnboardingSubmissionAsNewResponseSchema,
  UpdateOnboardingSubmissionRequestSchema,
  UpdateOnboardingSubmissionResponseSchema,
  type OnboardingFormData,
} from "@common/schemas/onboarding";
import { findOnboardingDuplicate } from "@/services/onboardingDuplicateService";
import { createCompany, updateCompany } from "@/services/companyService";
import { createUser, updateUser } from "@/services/userService";
import { generateSignedMembershipAgreementPdf } from "@/services/membershipAgreementService";
import { getServiceProviderByEntityId } from "@/services/serviceProviderService";
import {
  assertPeopleVineWritesEnabled,
  fetchPvAttributeOptions,
  pushOnboardingSubmissionToPeopleVine,
} from "@/services/peopleVinePortalService";
import { apiRequestWithPagination } from "@/services/peopleVineService";
import { sendCustomEmail } from "@/services/emailService";
import { loadOpenLink } from "@/controllers/publicOnboardingController";
import { PeopleVineTokenType, Role } from "@prisma/client";

// Shared by the admin-authenticated create endpoint and the public onboarding-link
// submit endpoint — both land in the same review queue with the same duplicate check.
export const createOnboardingSubmissionRecord = async (
  c: Context,
  formData: OnboardingFormData,
  submittedBy: string | null
) => {
  const prisma: PrismaClient = c.get("db");
  const duplicate = await findOnboardingDuplicate(c, formData.user.email);

  return prisma.onboardingSubmission.create({
    data: {
      mode: formData.mode,
      status: duplicate.duplicateMatchType ? "needs_attention" : "pending_review",
      formData: JSON.stringify(formData),
      submittedBy,
      duplicateMatchType: duplicate.duplicateMatchType,
      matchedCompanyId: duplicate.matchedCompanyId,
      matchedUserId: duplicate.matchedUserId,
    },
  });
};

// The PV survey that combines the payment form + agreement/terms signing (see also
// peopleVineWebhookController.ts, which listens for its completion). Configurable via
// env for the same reason as PEOPLEVINE_ONBOARDING_SURVEY_ID there.
const ONBOARDING_PAYMENT_FORM_URL_DEFAULT = "https://member.mhubchicago.com/form/20611";
// Matches the ServiceProvider seeded for PeopleVine's member portal (see seed.ts) —
// looked up by entityId rather than hardcoding its DB id, since that id is
// environment-specific. Also used by samlController.ts to decide when a pending_membership
// user's SAML identity should be swapped for their company's (see resolveSamlIdentityEmail).
export const PEOPLEVINE_SP_ENTITY_ID = "https://member.mhubchicago.com/";
// Where a regular (non-onboarding) member should land in PV after SSO. PV ignores
// RelayState and instead lands on the last PV page viewed in that browser, so the login
// page loads this page first (see peopleVineLandingUrl, handleStartLogin). The site root,
// not /home: landing on "/" makes PV re-pick the member page style (→ /home), while landing
// straight on /home keeps the public style picked during the logged-out visit, so members
// briefly saw a broken-CSS page until the Portal Homepage script reloaded it (verified
// against production PV 2026-10-06).
export const PEOPLEVINE_HOME_URL = "https://member.mhubchicago.com/";

export const getOnboardingPaymentFormUrl = (c: Context<AppType>): string =>
  (c.env.ONBOARDING_PAYMENT_FORM_URL as string | undefined) ?? ONBOARDING_PAYMENT_FORM_URL_DEFAULT;

// Shared with handleVerifyLogin (loginController.ts) — a pending_membership user who
// logs in through ANY path (not just this email's link) should still land on this same
// SSO+RelayState URL, so the redirect doesn't depend on a `returnTo` query param
// surviving the whole email→OTP→set-password chain intact.
// Re-introduced SSO (2026-09-23) after briefly trying a plain form link: PV changed the
// survey to "Registered Member Only", so an actual PV session is required to reach it at
// all now — a plain link no longer works. Still SAML/SSO'd through our own IdP, which is
// what was 502ing for accounts without a real active PV membership (see
// resolveSamlIdentityEmail, samlController.ts) — that root cause is unresolved and
// tracked separately (escalated to PV support), not fixed by this URL choice either way.
export const getOnboardingPaymentSsoUrl = async (c: Context<AppType>): Promise<string> => {
  const formUrl = getOnboardingPaymentFormUrl(c);
  const backendUrl = c.env.BACKEND_URL ?? "";
  const peopleVineSp = await getServiceProviderByEntityId(c, PEOPLEVINE_SP_ENTITY_ID);
  // Same SP-initiated entry as the dashboard's "mHUB Member Portal" tile (the SP's own
  // loginUrl, PV → our /saml → back to PV's ACS). PV ignores RelayState (verified
  // 2026-09-23): after SSO it lands on the last PV page viewed in that browser, which
  // is why the login page pre-opens the form before this SSO (peopleVineLandingUrl).
  if (peopleVineSp?.loginUrl) return peopleVineSp.loginUrl;
  return peopleVineSp
    ? `${backendUrl}/saml/sso/${peopleVineSp.id}`
    : formUrl; // fall back to the bare form link if the SP isn't seeded in this environment
};

// Fires once, right after a person's PV customer record is successfully created —
// covers every path that can create one (admin auto-approve, manual Approve from the
// review queue, new_company or existing_company) since they all funnel through here.
// Best-effort: a SendGrid failure must never undo or fail the PV push that already
// succeeded, so this only ever logs and swallows its own errors.
const sendOnboardingPaymentFormEmail = async (c: Context<AppType>, formData: OnboardingFormData): Promise<void> => {
  // The PV form itself requires a PV-side login — a bare link isn't enough, the person
  // needs an active PV session too. So the email links to OUR OWN login page with
  // `returnTo` pointed at OUR IdP-initiated SSO endpoint for PV (not the form directly);
  // our existing email+OTP+set-password flow (login/index.tsx, change-password/index.tsx)
  // already forwards `returnTo` through to completion, and the SSO endpoint then signs
  // them into PV via SAML with RelayState set to the form, landing them there logged in.
  const frontendUrl = c.env.FRONTEND_URL ?? "";
  const ssoUrl = await getOnboardingPaymentSsoUrl(c);
  const gateUrl = `${frontendUrl}/login?returnTo=${encodeURIComponent(ssoUrl)}`;
  // new_company only — the company (not the primary user) usually holds the subscription,
  // so an admin may designate a separate billing contact (e.g. AP/finance) to receive and
  // complete this instead. getUserByEmail matches this address too, so they can log in
  // as the same account. See billingContactEmail, schema.prisma.
  const billingContactEmail = formData.company.billingContactEmail?.trim();
  const primaryUserName = `${formData.user.firstName} ${formData.user.lastName}`.trim();
  const firstName = formData.user.firstName?.trim();
  try {
    await sendCustomEmail(c, billingContactEmail ? {
      to: billingContactEmail,
      subject: "Complete mHUB payment & membership agreement",
      html:
        `<p>Hi,</p>` +
        `<p>${primaryUserName || "A new member"} has started setting up${formData.company.name ? ` ${formData.company.name}'s` : ""} membership with mHUB, ` +
        `and you've been listed as the billing contact. To finish setting up the membership, please log in and complete the payment and membership agreement using the link below:</p>` +
        `<p><a href="${gateUrl}">${gateUrl}</a></p>` +
        `<p>See you soon!</p>`,
    } : {
      to: formData.user.email,
      to_name: primaryUserName || undefined,
      subject: "Complete your mHUB payment & membership agreement",
      html:
        `<p>Hi${firstName ? ` ${firstName}` : ""},</p>` +
        `<p>Welcome to mHUB! To finish setting up your membership, please log in and complete your payment and membership agreement using the link below:</p>` +
        `<p><a href="${gateUrl}">${gateUrl}</a></p>` +
        `<p>See you soon!</p>`,
    });
  } catch (e) {
    console.error(`[onboarding] Failed to send payment form email to ${formData.user.email}:`, e);
  }
};

// Shared by the manual Approve action and the auto-approve path for admin-entered
// submissions in handleCreateOnboardingSubmission below — same PV push either way.
const finalizeSubmissionPushToPeopleVine = async (
  c: Context<AppType>,
  row: { id: string; pvCompanyCustomerId: string | null },
  formData: OnboardingFormData,
  reviewerUserId: string | null
) => {
  const prisma: PrismaClient = c.get("db");

  let targetCompanyId: string;
  let existingCompanyPeopleVineId: string | null = null;
  let existingCompanyName: string | null = null;
  if (formData.scenario === "existing_company") {
    const existingCompany = await prisma.company.findUnique({ where: { id: formData.companyId } });
    if (!existingCompany) {
      throw "Selected company no longer exists";
    }
    targetCompanyId = existingCompany.id;
    existingCompanyPeopleVineId = existingCompany.peopleVineId;
    existingCompanyName = existingCompany.name;
  } else {
    targetCompanyId = ""; // created below once we have the PV push result
  }

  const result = await pushOnboardingSubmissionToPeopleVine(c, formData, {
    existingCompanyPeopleVineId,
    existingCompanyName,
    resumeCompanyPvCustomerId: row.pvCompanyCustomerId,
    onCompanyCreated: async (companyPvCustomerId) => {
      await prisma.onboardingSubmission.update({
        where: { id: row.id },
        data: { pvCompanyCustomerId: companyPvCustomerId },
      });
    },
  });

  if (formData.scenario === "new_company") {
    // No access yet — PV has no API to create a subscription/membership up front (see
    // pushOnboardingSubmissionToPeopleVine), so this company genuinely has none until a
    // real membership is assigned in PV and the sync engine (which reads the `source`
    // tag just written there) confirms it and advances accountStatus to "active".
    // Importing a record must never grant access on its own.
    const newCompany = await createCompany(c, {
      name: formData.company.name,
      peopleVineId: result.companyPvCustomerId,
      active: false,
      // The exact email PV's own company customer record was just given — the form's
      // business email if provided, else the same "+company" alias fallback.
      email: (result.companyEmail ?? formData.user.email).toLowerCase(),
      accountStatus: "pending_membership",
    });
    targetCompanyId = newCompany.id;
  }

  // Same "no access yet" reasoning as the company above — applies to both scenarios
  // (a brand-new company's owner, or a person attached to an existing company) since
  // neither has a confirmed real membership at push time.
  const newUser = await createUser(c, {
    name: `${formData.user.firstName} ${formData.user.lastName}`.trim(),
    email: formData.user.email,
    role: Role.USER,
    companyId: targetCompanyId,
    peopleVineId: result.userPvCustomerId,
    phone: formData.user.phone || null,
    address: formData.user.address?.street || null,
    city: formData.user.address?.city || null,
    state: formData.user.address?.state || null,
    zipCode: formData.user.address?.zip || null,
    memberSource: "subscription",
    active: false,
    accountStatus: "pending_membership",
    billingContactEmail: formData.company.billingContactEmail || null,
  });

  // The member already e-signed the Membership Agreement on the public onboarding-link
  // form itself (OnboardingFormDataSchema requires this for mode "link") — stamp it onto
  // the real PDF now that the User row finally exists to attach it to. Admin-entered
  // submissions never have `agreement` (the member always signs, never an admin on
  // their behalf), so this is skipped for those.
  if (formData.agreement?.agreed) {
    const signedAt = new Date();
    const signedName =
      formData.agreement.signatureType === "type" ? formData.agreement.fullLegalName!.trim() : newUser.name;
    const membershipAgreementPdf = await generateSignedMembershipAgreementPdf({
      fullLegalName: signedName,
      signatureType: formData.agreement.signatureType,
      signatureImageDataUrl: formData.agreement.signatureImageDataUrl,
      signedAt,
    });
    await updateUser(c, {
      id: newUser.id,
      membershipAgreementSignedAt: signedAt,
      membershipAgreementSignedName: signedName,
      membershipAgreementPdf,
    });
  }

  // Fire-and-forget from the caller's perspective — see sendOnboardingPaymentFormEmail
  // for why this can't be allowed to fail the push that already succeeded above.
  c.executionCtx.waitUntil(sendOnboardingPaymentFormEmail(c, formData));

  const resolutionNote =
    formData.scenario === "existing_company" && !result.linkedViaMembershipCard
      ? "Could not attach the new user to the company's PeopleVine membership (no active card found, or that card's membership type doesn't allow additional members) — they were linked by reference only. Attach them to the company's membership manually in the PV Control Panel."
      : null;

  return prisma.onboardingSubmission.update({
    where: { id: row.id },
    data: {
      status: "pushed_to_pv",
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      pvCustomerId: result.userPvCustomerId,
      matchedCompanyId: targetCompanyId,
      matchedUserId: newUser.id,
      ...(resolutionNote ? { resolutionNote } : {}),
    },
  });
};

// Real membership plans (Enterprise Membership, Garage - Large, etc.) don't live in
// /products at all — confirmed by checking PV's OpenAPI spec and a raw pull of every
// Type=service product, none of which were membership plans (all were operational fees:
// table reservations, event charges, day passes). PV models memberships through their
// own dedicated /memberships endpoint (MembershipDTO) instead. Type=subscription +
// Status=active scopes this to real, currently-sellable membership plans, excluding
// PV's other membership kinds (add-on, id badge, temp).
export const fetchActiveMembershipPackages = async (c: Context): Promise<{ id: string; name: string }[]> => {
  const memberships: any[] = [];
  let pageNumber = 1;
  while (true) {
    const { data, pagination } = await apiRequestWithPagination(c, {
      tokenType: PeopleVineTokenType.USER_COMPANY,
      endpoint: "/memberships",
      method: "GET",
      queryParams: {
        Page_Size: "100",
        Page_Number: String(pageNumber),
        Type: "subscription",
        Status: "active",
      },
    });
    memberships.push(...data);
    if (!pagination?.has_next_page) break;
    pageNumber++;
  }

  return memberships
    .filter((m) => m.title)
    .map((m) => ({ id: String(m.id), name: m.title as string }));
};

// Add-on memberships. For a person being added to an existing_company, the primary
// membership is inherited from the company rather than chosen here — this list is only
// ever additional/optional add-ons they might want. Sourced from mHub's own curated
// "Add-on Subscription Types" list (managed on the admin Sync settings page, see
// prisma.addonSubscriptionType / backend/src/index.ts /api/config/addon-subscription-types)
// rather than PV's live /memberships?Type=add-on catalog — PV's add-on-typed products
// didn't reliably reflect what staff actually offer, leaving this dropdown empty. This is
// the same list already used to classify synced subscriptions into the addOns bucket
// (see peopleVineServiceV2.ts), so it's already the source of truth for "what counts as
// an add-on" at mHub.
export const fetchActiveAddonMemberships = async (c: Context<AppType>): Promise<{ id: string; name: string }[]> => {
  const prisma: PrismaClient = c.get("db");
  const types = await prisma.addonSubscriptionType.findMany({ orderBy: { name: "asc" } });
  return types.map((t) => ({ id: t.name, name: t.name }));
};

const toSubmissionDTO = (row: {
  id: string;
  mode: string;
  status: string;
  formData: string;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  duplicateMatchType: string | null;
  matchedCompanyId: string | null;
  matchedUserId: string | null;
  resolutionNote: string | null;
  pvCustomerId: string | null;
  pvMembershipCardId: string | null;
  completedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...row,
  formData: JSON.parse(row.formData),
});

export const handleCreateOnboardingSubmission = async (
  c: Context<AppType, string, JsonInput<typeof CreateOnboardingSubmissionRequestSchema>>
) => {
  const user = c.get("user");
  const { formData } = c.req.valid("json");

  const created = await createOnboardingSubmissionRecord(
    c,
    formData,
    formData.mode === "admin" ? user?.id ?? null : null
  );

  // Admin-entered submissions skip Pending Review entirely when there's no duplicate
  // match — staff already vetted the data by typing it in themselves. Public
  // onboarding-link submissions (mode "link", forced in handleSubmitOnboardingLink)
  // always land in the review queue regardless of this, since an unauthenticated
  // customer filled them out.
  const canAutoApprove =
    formData.mode === "admin" && created.status === "pending_review" && c.env.PEOPLEVINE_WRITE_ENABLED === "true";
  // `created` above is already committed — a PV push failure here must never fail this
  // whole request (the row would stay orphaned in "pending_review" while the caller sees
  // an error and, not knowing the row already exists, resubmits — piling up duplicate
  // copies of the same submission, each hitting the same failure). Auto-approve is a
  // best-effort convenience on top of an already-successful "record this submission";
  // if it fails, fall back to the plain pending_review row exactly as if writes were
  // disabled — staff can retry via the existing, separate Approve action once the
  // underlying PV issue is resolved.
  let submission = created;
  if (canAutoApprove) {
    try {
      submission = await finalizeSubmissionPushToPeopleVine(c, created, formData, user?.id ?? null);
    } catch (e) {
      console.error(`[onboarding] Auto-approve failed for submission ${created.id}, leaving as pending_review:`, e);
    }
  }

  const response = CreateOnboardingSubmissionResponseSchema.parse({
    success: true,
    message:
      submission.status === "pushed_to_pv" ? "Onboarding submission pushed to PeopleVine" : "Onboarding submission recorded",
    data: { submission: toSubmissionDTO(submission) },
  });
  return c.json(response);
};

export const handleGetOnboardingSubmissions = async (
  c: Context<AppType, string, QueryInput<typeof GetOnboardingSubmissionsQuerySchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const { status } = c.req.valid("query");

  const rows = await prisma.onboardingSubmission.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });

  const response = GetOnboardingSubmissionsResponseSchema.parse({
    success: true,
    message: "Success",
    data: { submissions: rows.map(toSubmissionDTO) },
  });
  return c.json(response);
};

// By the time a Company/User row exists at all, PV account creation (§ "account" step)
// has already happened — finalizeSubmissionPushToPeopleVine always sets peopleVineId at
// creation time — so that step's timestamp is just the row's own createdAt. The "invite"
// step similarly can't be reconstructed from an exact "email sent" timestamp (not
// tracked), so the originating submission's createdAt (when the invite link was filled
// out and submitted) is used as a close proxy, and the step is omitted entirely for
// mode: "admin" submissions, which never had an invite link at all — mirrors the
// mockup's `stepsFor`. Only "payment" and "subscription" are real, independently tracked
// state (see onboardingPaymentAgreementAt / onboardingSubscriptionAppliedAt).
const SCENARIO_LOOKUP_CHUNK = 90;

const readSubmissionScenarios = async (db: D1Database, ids: string[]): Promise<Map<string, string | null>> => {
  const scenarios = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += SCENARIO_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + SCENARIO_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT id, json_extract(formData, '$.scenario') AS scenario FROM OnboardingSubmission WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ id: string; scenario: string | null }>();
    for (const row of results) scenarios.set(row.id, row.scenario);
  }
  return scenarios;
};

const scenarioOf = (formData: string): string | null => {
  try {
    const parsed = JSON.parse(formData) as { scenario?: unknown };
    return typeof parsed.scenario === "string" ? parsed.scenario : null;
  } catch {
    return null;
  }
};

const buildOnboardingProgress = (
  row: {
    createdAt: Date;
    onboardingPaymentAgreementAt: Date | null;
    onboardingPaymentAgreementSkippedBy: string | null;
    onboardingSubscriptionAppliedAt: Date | null;
  },
  submission: { mode: string; createdAt: Date; scenario: string | null } | undefined
) => ({
  via: (submission?.mode === "link" ? "invite" : "admin") as "invite" | "admin",
  scenario: submission
    ? ((submission.scenario === "existing_company" ? "existing_company" : "new_company") as "new_company" | "existing_company")
    : null,
  steps: {
    invite: submission?.mode === "link" ? submission.createdAt : null,
    account: row.createdAt,
    payment: row.onboardingPaymentAgreementAt,
    subscription: row.onboardingSubscriptionAppliedAt,
  },
  paymentSkipped: !!row.onboardingPaymentAgreementSkippedBy,
});

// "Default (in-process)" onboarding tab: live Company/User rows still awaiting a
// membership (accountStatus "pending_membership"), not OnboardingSubmission rows —
// see GetOnboardingInProcessResponseSchema. Read-only, local DB only.
export const handleGetOnboardingInProcess = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");

  const [companies, users] = await Promise.all([
    prisma.company.findMany({ where: { accountStatus: "pending_membership" }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { accountStatus: "pending_membership" }, orderBy: { createdAt: "desc" } }),
  ]);

  const companyIds = companies.map((co) => co.id);
  const userIds = users.map((u) => u.id);
  const submissions =
    companyIds.length || userIds.length
      ? await prisma.onboardingSubmission.findMany({
          where: {
            OR: [
              ...(companyIds.length ? [{ matchedCompanyId: { in: companyIds } }] : []),
              ...(userIds.length ? [{ matchedUserId: { in: userIds } }] : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, mode: true, createdAt: true, matchedCompanyId: true, matchedUserId: true },
        })
      : [];
  // Most recent submission per target wins (findMany above is already ordered desc, so
  // the first match seen for a given id is kept).
  const scenarios = await readSubmissionScenarios(c.env.DB, submissions.map((s) => s.id));
  const submissionByCompanyId = new Map<string, { id: string; mode: string; createdAt: Date; scenario: string | null }>();
  const submissionByUserId = new Map<string, { id: string; mode: string; createdAt: Date; scenario: string | null }>();
  for (const found of submissions) {
    const s = { ...found, scenario: scenarios.get(found.id) ?? null };
    if (s.matchedCompanyId && !submissionByCompanyId.has(s.matchedCompanyId)) {
      submissionByCompanyId.set(s.matchedCompanyId, s);
    }
    if (s.matchedUserId && !submissionByUserId.has(s.matchedUserId)) {
      submissionByUserId.set(s.matchedUserId, s);
    }
  }

  const records = [
    ...companies.map((co) => ({
      id: co.id,
      type: "company" as const,
      name: co.name,
      email: co.email,
      peopleVineId: co.peopleVineId,
      createdAt: co.createdAt,
      submissionId: submissionByCompanyId.get(co.id)?.id ?? null,
      ...buildOnboardingProgress(co, submissionByCompanyId.get(co.id)),
    })),
    ...users.map((u) => ({
      id: u.id,
      type: "user" as const,
      name: u.name,
      email: u.email,
      peopleVineId: u.peopleVineId,
      createdAt: u.createdAt,
      submissionId: submissionByUserId.get(u.id)?.id ?? null,
      ...buildOnboardingProgress(u, submissionByUserId.get(u.id)),
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const response = GetOnboardingInProcessResponseSchema.parse({
    success: true,
    message: "Success",
    data: { records },
  });
  return c.json(response);
};

// Manually marks the final onboarding step complete. Purely local bookkeeping — PV has
// no API to create/apply a subscription (confirmed platform limitation, see
// peopleVinePortalService.ts), so staff apply the membership in the PV Control Panel
// themselves and this just records that they did. No PeopleVine API call is made here.
export const handleApplyOnboardingSubscription = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const type = c.req.param("type");
  const id = c.req.param("id");

  if (type !== "company" && type !== "user") {
    throw new HTTPException(400, { message: "Invalid record type" });
  }

  const row = type === "company"
    ? await prisma.company.findUnique({ where: { id } })
    : await prisma.user.findUnique({ where: { id } });
  if (!row) {
    throw new HTTPException(404, { message: "Onboarding record not found" });
  }
  if (!row.onboardingPaymentAgreementAt) {
    throw new HTTPException(400, { message: "Payment & Agreement must be completed before applying the subscription" });
  }
  if (row.onboardingSubscriptionAppliedAt) {
    throw new HTTPException(400, { message: "Subscription has already been marked as applied" });
  }

  const data = { onboardingSubscriptionAppliedAt: new Date(), onboardingSubscriptionAppliedBy: user?.id ?? null };
  const updated =
    type === "company"
      ? await prisma.company.update({ where: { id }, data })
      : await prisma.user.update({ where: { id }, data });

  const submission =
    type === "company"
      ? await prisma.onboardingSubmission.findFirst({ where: { matchedCompanyId: id }, orderBy: { createdAt: "desc" } })
      : await prisma.onboardingSubmission.findFirst({ where: { matchedUserId: id }, orderBy: { createdAt: "desc" } });

  const response = ApplyOnboardingSubscriptionResponseSchema.parse({
    success: true,
    message: "Subscription marked as applied",
    data: {
      record: {
        id: updated.id,
        type,
        name: updated.name,
        email: updated.email,
        peopleVineId: updated.peopleVineId,
        createdAt: updated.createdAt,
        submissionId: submission?.id ?? null,
        ...buildOnboardingProgress(updated, submission ? { ...submission, scenario: scenarioOf(submission.formData) } : undefined),
      },
    },
  });
  return c.json(response);
};

// Admin override for when payment won't happen through the self-serve PV form (e.g. the
// company is being invoiced directly). Marked distinctly from a real PV-confirmed
// payment via onboardingPaymentAgreementSkippedBy, so it's clear in records/reports.
export const handleSkipOnboardingPayment = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const type = c.req.param("type");
  const id = c.req.param("id");

  if (type !== "company" && type !== "user") {
    throw new HTTPException(400, { message: "Invalid record type" });
  }

  const row = type === "company"
    ? await prisma.company.findUnique({ where: { id } })
    : await prisma.user.findUnique({ where: { id } });
  if (!row) {
    throw new HTTPException(404, { message: "Onboarding record not found" });
  }
  if (row.onboardingPaymentAgreementAt) {
    throw new HTTPException(400, { message: "Payment & Agreement has already been completed" });
  }

  const data = { onboardingPaymentAgreementAt: new Date(), onboardingPaymentAgreementSkippedBy: user?.id ?? null };
  const updated =
    type === "company"
      ? await prisma.company.update({ where: { id }, data })
      : await prisma.user.update({ where: { id }, data });

  const submission =
    type === "company"
      ? await prisma.onboardingSubmission.findFirst({ where: { matchedCompanyId: id }, orderBy: { createdAt: "desc" } })
      : await prisma.onboardingSubmission.findFirst({ where: { matchedUserId: id }, orderBy: { createdAt: "desc" } });

  const response = SkipOnboardingPaymentResponseSchema.parse({
    success: true,
    message: "Payment & Agreement step skipped",
    data: {
      record: {
        id: updated.id,
        type,
        name: updated.name,
        email: updated.email,
        peopleVineId: updated.peopleVineId,
        createdAt: updated.createdAt,
        submissionId: submission?.id ?? null,
        ...buildOnboardingProgress(updated, submission ? { ...submission, scenario: scenarioOf(submission.formData) } : undefined),
      },
    },
  });
  return c.json(response);
};

export const handleGetOnboardingSubmissionById = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const id = c.req.param("id");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }

  const response = GetOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Success",
    data: { submission: toSubmissionDTO(row) },
  });
  return c.json(response);
};

const EDITABLE_STATUSES = new Set(["pending_review", "needs_attention"]);

export const handleUpdateOnboardingSubmission = async (
  c: Context<AppType, string, JsonInput<typeof UpdateOnboardingSubmissionRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const id = c.req.param("id");
  const { formData } = c.req.valid("json");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (!EDITABLE_STATUSES.has(row.status)) {
    throw "Only submissions in Pending Review or Needs Attention can be edited";
  }

  // Re-run the duplicate check against the edited email — an edit that resolves the
  // conflict (or introduces a new one) should move the submission accordingly instead
  // of leaving it stuck on whatever match was found at original submission time.
  const duplicate = await findOnboardingDuplicate(c, formData.user.email);

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      formData: JSON.stringify(formData),
      status: duplicate.duplicateMatchType ? "needs_attention" : "pending_review",
      duplicateMatchType: duplicate.duplicateMatchType,
      matchedCompanyId: duplicate.matchedCompanyId,
      matchedUserId: duplicate.matchedUserId,
    },
  });

  const response = UpdateOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Onboarding submission updated",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleApproveOnboardingSubmission = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  // Defense in depth: fail fast here, before touching the submission or calling the
  // PV client, if writes aren't explicitly enabled.
  assertPeopleVineWritesEnabled(c);

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (row.status !== "pending_review") {
    throw "Only submissions in Pending Review can be approved";
  }

  const formData = JSON.parse(row.formData);
  const updated = await finalizeSubmissionPushToPeopleVine(c, row, formData, user?.id ?? null);

  const response = ApproveOnboardingSubmissionResponseSchema.parse({
    success: true,
    message:
      "Onboarding submission pushed to PeopleVine — mHUB staff still need to assign the requested membership package manually in the PV Control Panel.",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleReactivateOnboardingSubmission = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (row.status !== "needs_attention") {
    throw "Only submissions in Needs Attention can be reactivated";
  }

  if (row.matchedCompanyId) {
    await updateCompany(c, { id: row.matchedCompanyId, active: true });
    await prisma.user.updateMany({
      where: { companyId: row.matchedCompanyId, memberSource: "subscription" },
      data: { active: true },
    });
  } else if (row.matchedUserId) {
    await updateUser(c, { id: row.matchedUserId, active: true });
  } else {
    throw "No matched company or user to reactivate";
  }

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      status: "reactivated",
      reviewedBy: user?.id ?? null,
      reviewedAt: new Date(),
    },
  });

  const response = ReactivateOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Existing record reactivated",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleCompleteOnboardingSubmission = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (row.status !== "pushed_to_pv") {
    throw "Only submissions pushed to PeopleVine can be marked as onboarding completed";
  }

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      status: "completed",
      completedBy: user?.id ?? null,
      completedAt: new Date(),
    },
  });

  const response = CompleteOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Submission marked as onboarding completed",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleTreatOnboardingSubmissionAsNew = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (row.status !== "needs_attention") {
    throw "Only submissions in Needs Attention can be treated as new";
  }

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      status: "pending_review",
      duplicateMatchType: null,
      matchedCompanyId: null,
      matchedUserId: null,
      reviewedBy: user?.id ?? null,
      reviewedAt: new Date(),
    },
  });

  const response = TreatOnboardingSubmissionAsNewResponseSchema.parse({
    success: true,
    message: "Submission moved to Pending Review",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleFlagOnboardingSubmission = async (
  c: Context<AppType, string, JsonInput<typeof FlagOnboardingSubmissionRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const { resolutionNote } = c.req.valid("json");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (row.status !== "needs_attention") {
    throw "Only submissions in Needs Attention can be flagged for cleanup";
  }

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      status: "flagged_for_cleanup",
      resolutionNote: resolutionNote ?? null,
      reviewedBy: user?.id ?? null,
      reviewedAt: new Date(),
    },
  });

  const response = FlagOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Submission flagged for manual cleanup",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleDisapproveOnboardingSubmission = async (
  c: Context<AppType, string, JsonInput<typeof DisapproveOnboardingSubmissionRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const { resolutionNote } = c.req.valid("json");

  const row = await prisma.onboardingSubmission.findUnique({ where: { id } });
  if (!row) {
    throw "Onboarding submission not found";
  }
  if (row.status !== "pending_review") {
    throw "Only submissions in Pending Review can be disapproved";
  }

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      status: "disapproved",
      resolutionNote: resolutionNote ?? null,
      reviewedBy: user?.id ?? null,
      reviewedAt: new Date(),
    },
  });

  const response = DisapproveOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Submission disapproved",
    data: { submission: toSubmissionDTO(updated) },
  });
  return c.json(response);
};

export const handleGetOnboardingMembershipPackages = async (c: Context<AppType>) => {
  const packages = await fetchActiveMembershipPackages(c);

  const response = GetOnboardingMembershipPackagesResponseSchema.parse({
    success: true,
    message: "Success",
    data: { packages },
  });
  return c.json(response);
};

export const handleGetOnboardingAddonPackages = async (c: Context<AppType>) => {
  const packages = await fetchActiveAddonMemberships(c);

  const response = GetOnboardingAddonPackagesResponseSchema.parse({
    success: true,
    message: "Success",
    data: { packages },
  });
  return c.json(response);
};

// Shared by the admin-authenticated onboarding routes and the public onboarding-link
// routes — both forms need the same PV-sourced fixed-choice lists (schools, degrees,
// pronouns, ethnicity, shop skills, ...) to render their dropdowns/checkboxes.
export const handleGetOnboardingAttributeOptions = async (c: Context<AppType>) => {
  const options = await fetchPvAttributeOptions(c);

  const response = GetOnboardingAttributeOptionsResponseSchema.parse({
    success: true,
    message: "Success",
    data: { options },
  });
  return c.json(response);
};

// Admin composes the subject/body themselves (rich text editor on the frontend) —
// this only ever forwards exactly what they wrote, plus the recipient. Requires the
// link to still be open (not yet submitted/expired/revoked) so staff can't send out a
// dead link by mistake.
export const handleSendOnboardingLinkEmail = async (
  c: Context<AppType, string, JsonInput<typeof SendOnboardingLinkEmailRequestSchema>>
) => {
  await loadOpenLink(c);
  const { to, toName, subject, html } = c.req.valid("json");

  await sendCustomEmail(c, { to, to_name: toName, subject, html });

  const response = SendOnboardingLinkEmailResponseSchema.parse({
    success: true,
    message: "Email sent",
    data: {},
  });
  return c.json(response);
};

export const handleCreateOnboardingLink = async (
  c: Context<AppType, string, JsonInput<typeof CreateOnboardingLinkRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const { scenario } = c.req.valid("json");

  const token = crypto.randomUUID();
  await prisma.onboardingLink.create({
    data: {
      token,
      scenario,
      createdBy: user?.id ?? null,
    },
  });

  const frontendUrl = c.env.FRONTEND_URL ?? "";
  const response = CreateOnboardingLinkResponseSchema.parse({
    success: true,
    message: "Onboarding link created",
    data: { url: `${frontendUrl}/onboard/${token}`, token },
  });
  return c.json(response);
};
