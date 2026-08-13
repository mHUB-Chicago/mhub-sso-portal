CREATE TABLE "OnboardingLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT,
  "submissionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME
);

CREATE UNIQUE INDEX "OnboardingLink_token_key" ON "OnboardingLink"("token");
