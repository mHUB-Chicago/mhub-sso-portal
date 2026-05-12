-- Add membershipType and isPersonal to Company, membershipType to User
ALTER TABLE "Company" ADD COLUMN "membershipType" TEXT;
ALTER TABLE "Company" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "membershipType" TEXT;
