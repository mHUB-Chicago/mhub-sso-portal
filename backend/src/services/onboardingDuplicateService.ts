import { Context } from "hono";
import { PrismaClient } from "@prisma/client";

export interface OnboardingDuplicateMatch {
  duplicateMatchType: "company_email" | "user_email" | null;
  matchedCompanyId: string | null;
  matchedUserId: string | null;
}

export const findOnboardingDuplicate = async (
  c: Context,
  email: string
): Promise<OnboardingDuplicateMatch> => {
  const prisma: PrismaClient = c.get("db");
  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail) {
    return { duplicateMatchType: null, matchedCompanyId: null, matchedUserId: null };
  }

  const matchedCompany = await prisma.company.findFirst({
    where: { email: normalizedEmail },
  });
  if (matchedCompany) {
    return {
      duplicateMatchType: "company_email",
      matchedCompanyId: matchedCompany.id,
      matchedUserId: null,
    };
  }

  const matchedUser = await prisma.user.findFirst({
    where: { email: normalizedEmail },
  });
  if (matchedUser) {
    return {
      duplicateMatchType: "user_email",
      matchedCompanyId: null,
      matchedUserId: matchedUser.id,
    };
  }

  return { duplicateMatchType: null, matchedCompanyId: null, matchedUserId: null };
};
