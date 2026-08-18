import { Context } from "hono";
import { PrismaClient } from "@prisma/client";
import { AppType, JsonInput } from "..";
import {
  GetOnboardingLinkResponseSchema,
  SubmitOnboardingLinkRequestSchema,
  SubmitOnboardingLinkResponseSchema,
} from "@common/schemas/onboarding";
import { fetchActiveMembershipPackages, createOnboardingSubmissionRecord } from "@/controllers/onboardingController";

const OPEN_LINK_STATUSES = new Set(["active"]);

// Exported for the admin "send this link by email" action, which needs the same
// exists/active/not-expired checks before sending — no reason to duplicate them.
export const loadOpenLink = async (c: Context) => {
  const prisma: PrismaClient = c.get("db");
  const token = c.req.param("token");

  const link = await prisma.onboardingLink.findUnique({ where: { token } });
  if (!link) {
    throw "This onboarding link is invalid";
  }
  if (!OPEN_LINK_STATUSES.has(link.status)) {
    throw "This onboarding link has already been used or was revoked";
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    throw "This onboarding link has expired";
  }
  return link;
};

export const handleGetOnboardingLink = async (c: Context<AppType>) => {
  const prisma: PrismaClient = c.get("db");
  const link = await loadOpenLink(c);

  const packages = await fetchActiveMembershipPackages(c);

  const companies =
    link.scenario === "existing_company"
      ? await prisma.company.findMany({
          where: { active: true, isSystemAccount: false },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : undefined;

  const response = GetOnboardingLinkResponseSchema.parse({
    success: true,
    message: "Success",
    data: { scenario: link.scenario, packages, companies },
  });
  return c.json(response);
};

export const handleSubmitOnboardingLink = async (
  c: Context<AppType, string, JsonInput<typeof SubmitOnboardingLinkRequestSchema>>
) => {
  const prisma: PrismaClient = c.get("db");
  const link = await loadOpenLink(c);
  const { formData } = c.req.valid("json");

  if (formData.scenario !== link.scenario) {
    throw "This submission doesn't match the link's scenario";
  }

  // The public form is never trusted with admin identity or an admin-only mode value —
  // force both server-side regardless of what the client sent.
  const created = await createOnboardingSubmissionRecord(c, { ...formData, mode: "link" }, null);

  await prisma.onboardingLink.update({
    where: { id: link.id },
    data: { status: "used", submissionId: created.id },
  });

  const response = SubmitOnboardingLinkResponseSchema.parse({
    success: true,
    message: "Submission received",
    data: {},
  });
  return c.json(response);
};
