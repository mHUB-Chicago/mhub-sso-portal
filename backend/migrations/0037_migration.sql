ALTER TABLE "User" ADD COLUMN "accountStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Company" ADD COLUMN "accountStatus" TEXT NOT NULL DEFAULT 'active';
