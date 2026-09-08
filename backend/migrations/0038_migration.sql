ALTER TABLE "Company" ADD COLUMN "onboardingPaymentAgreementAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "onboardingSubscriptionAppliedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "onboardingSubscriptionAppliedBy" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingPaymentAgreementAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "onboardingSubscriptionAppliedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "onboardingSubscriptionAppliedBy" TEXT;
