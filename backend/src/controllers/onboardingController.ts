import { Context } from "hono";
import { PrismaClient } from "@prisma/client";
import { AppType, JsonInput, QueryInput } from "..";
import {
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
  if (formData.scenario === "existing_company") {
    const existingCompany = await prisma.company.findUnique({ where: { id: formData.companyId } });
    if (!existingCompany) {
      throw "Selected company no longer exists";
    }
    targetCompanyId = existingCompany.id;
    existingCompanyPeopleVineId = existingCompany.peopleVineId;
  } else {
    targetCompanyId = ""; // created below once we have the PV push result
  }

  const result = await pushOnboardingSubmissionToPeopleVine(c, formData, {
    existingCompanyPeopleVineId,
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
  await createUser(c, {
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
  });

  const resolutionNote =
    formData.scenario === "existing_company" && !result.linkedViaMembershipCard
      ? "No active PeopleVine membership card found for this company — the new user was linked by reference only. Attach them to the company's membership manually in the PV Control Panel."
      : null;

  return prisma.onboardingSubmission.update({
    where: { id: row.id },
    data: {
      status: "pushed_to_pv",
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      pvCustomerId: result.userPvCustomerId,
      matchedCompanyId: targetCompanyId,
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

// Add-on memberships (Type="add-on" per PV's own /memberships enum — a different kind
// from the primary "subscription" plans above). For a person being added to an
// existing_company, the primary membership is inherited from the company rather than
// chosen here — this list is only ever additional/optional add-ons they might want.
export const fetchActiveAddonMemberships = async (c: Context): Promise<{ id: string; name: string }[]> => {
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
        Type: "add-on",
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

// "Default (in-process)" onboarding tab: live Company/User rows still awaiting a
// membership (accountStatus "pending_membership"), not OnboardingSubmission rows —
// see GetOnboardingInProcessResponseSchema. Read-only, local DB only.
export const handleGetOnboardingInProcess = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");

  const [companies, users] = await Promise.all([
    prisma.company.findMany({ where: { accountStatus: "pending_membership" }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { accountStatus: "pending_membership" }, orderBy: { createdAt: "desc" } }),
  ]);

  const records = [
    ...companies.map((co) => ({
      id: co.id,
      type: "company" as const,
      name: co.name,
      email: co.email,
      peopleVineId: co.peopleVineId,
      createdAt: co.createdAt,
    })),
    ...users.map((u) => ({
      id: u.id,
      type: "user" as const,
      name: u.name,
      email: u.email,
      peopleVineId: u.peopleVineId,
      createdAt: u.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const response = GetOnboardingInProcessResponseSchema.parse({
    success: true,
    message: "Success",
    data: { records },
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

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: { formData: JSON.stringify(formData) },
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
      "Onboarding submission pushed to PeopleVine — mHub staff still need to assign the requested membership package manually in the PV Control Panel.",
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
