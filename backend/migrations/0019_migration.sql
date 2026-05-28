ALTER TABLE "User" RENAME COLUMN "membershipType" TO "primaryMembership";
ALTER TABLE "User" ADD COLUMN "addOns" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "PrimarySubscriptionType" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AddonSubscriptionType" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "PrimarySubscriptionType" ("name", "createdAt") VALUES
  ('Associate Membership - Corporate',     CURRENT_TIMESTAMP),
  ('Associate Membership - Startup/SME',   CURRENT_TIMESTAMP),
  ('Associate Membership (10,000+)',        CURRENT_TIMESTAMP),
  ('Associate Membership (12-50)',          CURRENT_TIMESTAMP),
  ('Associate Membership (50 - 500)',       CURRENT_TIMESTAMP),
  ('Associate Membership (500 - 10,000)',   CURRENT_TIMESTAMP),
  ('Associate Membership (Sponsorship)',    CURRENT_TIMESTAMP),
  ('Associate Membership (University)',     CURRENT_TIMESTAMP),
  ('Co-Working Student Rate',              CURRENT_TIMESTAMP),
  ('Convertible Garage - Large',           CURRENT_TIMESTAMP),
  ('Convertible Garage - Small',           CURRENT_TIMESTAMP),
  ('Garage - Large',                       CURRENT_TIMESTAMP),
  ('Garage - Medium',                      CURRENT_TIMESTAMP),
  ('Garage - Small',                       CURRENT_TIMESTAMP),
  ('Office - Large',                       CURRENT_TIMESTAMP),
  ('Office - Medium',                      CURRENT_TIMESTAMP),
  ('Office - Partner',                     CURRENT_TIMESTAMP),
  ('Office - Small',                       CURRENT_TIMESTAMP),
  ('Partner Office - Large',               CURRENT_TIMESTAMP),
  ('Partner Office - Medium',              CURRENT_TIMESTAMP),
  ('Partner Office - Small',               CURRENT_TIMESTAMP),
  ('Reserved Desk',                        CURRENT_TIMESTAMP),
  ('Shared Workspace',                     CURRENT_TIMESTAMP),
  ('Shared Workspace – Intern',            CURRENT_TIMESTAMP),
  ('Wet Lab',                              CURRENT_TIMESTAMP);

INSERT INTO "AddonSubscriptionType" ("name", "createdAt") VALUES
  ('Accelerator Shared Workspace', CURRENT_TIMESTAMP),
  ('Active EIR Workbook User',     CURRENT_TIMESTAMP);
