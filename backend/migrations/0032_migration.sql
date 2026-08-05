CREATE TABLE "OnboardingSubmission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "formData" TEXT NOT NULL,
  "submittedBy" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" DATETIME,
  "reviewNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
