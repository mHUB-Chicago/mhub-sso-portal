ALTER TABLE "Company" ADD COLUMN "onboardingLearnWorldsStatus" TEXT;
ALTER TABLE "Company" ADD COLUMN "onboardingLearnWorldsAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "onboardingDigiFabsterStatus" TEXT;
ALTER TABLE "Company" ADD COLUMN "onboardingDigiFabsterAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "onboardingServiceProvidersSkippedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "onboardingServiceProvidersSkippedBy" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingLearnWorldsStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingLearnWorldsAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "onboardingDigiFabsterStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingDigiFabsterAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "onboardingServiceProvidersSkippedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "onboardingServiceProvidersSkippedBy" TEXT;

UPDATE "Company" SET "onboardingServiceProvidersSkippedAt" = "onboardingSubscriptionAppliedAt", "onboardingServiceProvidersSkippedBy" = 'pre-existing'
WHERE "onboardingSubscriptionAppliedAt" IS NOT NULL;
UPDATE "User" SET "onboardingServiceProvidersSkippedAt" = "onboardingSubscriptionAppliedAt", "onboardingServiceProvidersSkippedBy" = 'pre-existing'
WHERE "onboardingSubscriptionAppliedAt" IS NOT NULL;
