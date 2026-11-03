ALTER TABLE "Offboarding" ADD COLUMN "externalRemovedAt" DATETIME;
ALTER TABLE "Offboarding" ADD COLUMN "externalRemovedBy" TEXT;

UPDATE "Offboarding" SET "externalRemovedAt" = "completedAt", "externalRemovedBy" = 'pre-existing'
WHERE "completedAt" IS NOT NULL;
