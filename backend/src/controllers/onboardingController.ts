import { Context } from "hono";
import { PrismaClient } from "@prisma/client";
import { AppType, JsonInput, QueryInput } from "..";
import {
  ApproveOnboardingSubmissionResponseSchema,
  CreateOnboardingSubmissionRequestSchema,
  CreateOnboardingSubmissionResponseSchema,
  FlagOnboardingSubmissionRequestSchema,
  FlagOnboardingSubmissionResponseSchema,
  GetOnboardingMembershipPackagesResponseSchema,
  GetOnboardingSubmissionResponseSchema,
  GetOnboardingSubmissionsQuerySchema,
  GetOnboardingSubmissionsResponseSchema,
  ReactivateOnboardingSubmissionResponseSchema,
  TreatOnboardingSubmissionAsNewResponseSchema,
} from "@common/schemas/onboarding";
import { findOnboardingDuplicate } from "@/services/onboardingDuplicateService";
import { updateCompany } from "@/services/companyService";
import { updateUser } from "@/services/userService";
import { assertPeopleVineWritesEnabled, pushOnboardingSubmissionToPeopleVine } from "@/services/peopleVinePortalService";
import { apiRequest } from "@/services/peopleVineService";
import { PeopleVineTokenType } from "@prisma/client";

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
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...row,
  formData: JSON.parse(row.formData),
});

export const handleCreateOnboardingSubmission = async (
  c: Context<AppType, string, JsonInput<typeof CreateOnboardingSubmissionRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const user = c.get("user");
  const { formData } = c.req.valid("json");

  const duplicate = await findOnboardingDuplicate(c, formData.user.email);

  const created = await prisma.onboardingSubmission.create({
    data: {
      mode: formData.mode,
      status: duplicate.duplicateMatchType ? "needs_attention" : "pending_review",
      formData: JSON.stringify(formData),
      submittedBy: formData.mode === "admin" ? user?.id ?? null : null,
      duplicateMatchType: duplicate.duplicateMatchType,
      matchedCompanyId: duplicate.matchedCompanyId,
      matchedUserId: duplicate.matchedUserId,
    },
  });

  const response = CreateOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: "Onboarding submission recorded",
    data: { submission: toSubmissionDTO(created) },
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
  const result = await pushOnboardingSubmissionToPeopleVine(c, formData);

  const updated = await prisma.onboardingSubmission.update({
    where: { id },
    data: {
      status: "pushed_to_pv",
      reviewedBy: user?.id ?? null,
      reviewedAt: new Date(),
      pvCustomerId: result.pvCustomerId,
      pvMembershipCardId: result.pvMembershipCardId,
      reviewNote: result.warning ?? null,
    },
  });

  const response = ApproveOnboardingSubmissionResponseSchema.parse({
    success: true,
    message: result.warning ?? "Onboarding submission pushed to PeopleVine",
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

export const handleGetOnboardingMembershipPackages = async (c: Context<AppType>) => {
  const products: any[] = await apiRequest(c, {
    tokenType: PeopleVineTokenType.USER_COMPANY,
    endpoint: "/products",
    method: "GET",
    queryParams: { Page_Size: "200" },
  });

  const packages = (Array.isArray(products) ? products : []).map((p) => ({
    id: String(p.id),
    name: p.name ?? p.title ?? `Product ${p.id}`,
  }));

  const response = GetOnboardingMembershipPackagesResponseSchema.parse({
    success: true,
    message: "Success",
    data: { packages },
  });
  return c.json(response);
};
