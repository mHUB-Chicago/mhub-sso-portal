CREATE TABLE "Offboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "peopleVineId" TEXT,
    "via" TEXT NOT NULL,
    "members" TEXT NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "accessRemovedAt" DATETIME,
    "accessRemovedBy" TEXT,
    "pvRemovedAt" DATETIME,
    "completedAt" DATETIME,
    "completedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "Offboarding_completedAt_idx" ON "Offboarding"("completedAt");
CREATE INDEX "Offboarding_userId_idx" ON "Offboarding"("userId");
CREATE INDEX "Offboarding_companyId_idx" ON "Offboarding"("companyId");

ALTER TABLE "User" ADD COLUMN "offboardedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "offboardedAt" DATETIME;
