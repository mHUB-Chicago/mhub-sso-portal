ALTER TABLE "OnboardingSubmission" ADD COLUMN "duplicateMatchType" TEXT;
ALTER TABLE "OnboardingSubmission" ADD COLUMN "matchedCompanyId" TEXT;
ALTER TABLE "OnboardingSubmission" ADD COLUMN "matchedUserId" TEXT;
ALTER TABLE "OnboardingSubmission" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "OnboardingSubmission" ADD COLUMN "pvCustomerId" TEXT;
ALTER TABLE "OnboardingSubmission" ADD COLUMN "pvMembershipCardId" TEXT;
UPDATE "OnboardingSubmission" SET "status" = 'submitted' WHERE "status" = 'pending';
