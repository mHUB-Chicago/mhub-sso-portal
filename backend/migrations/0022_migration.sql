-- Fix PortalAccessType: remove entries that do not grant portal access per sheet
DELETE FROM "PortalAccessType" WHERE "name" IN (
  'Accelerator Shared Workspace',
  'Shop - Full-Time',
  'mPOWER Program'
);

-- Add missing entries that grant portal access per sheet
INSERT OR IGNORE INTO "PortalAccessType" ("name", "createdAt") VALUES
  ('Associate Membership (Complimentary)', CURRENT_TIMESTAMP),
  ('Fabrication Customer',                 CURRENT_TIMESTAMP),
  ('Membership - AI - C Cohort 1',         CURRENT_TIMESTAMP),
  ('Membership - AI - IIOT Cohort 1',      CURRENT_TIMESTAMP),
  ('Membership - AI - MedTech Cohort 1',   CURRENT_TIMESTAMP),
  ('Membership - AI - MedTech Cohort 2',   CURRENT_TIMESTAMP),
  ('mHUB Board of Directors',              CURRENT_TIMESTAMP),
  ('mHUB Executive Committee',             CURRENT_TIMESTAMP),
  ('mHUB Staff',                           CURRENT_TIMESTAMP),
  ('mHUB Venture Board',                   CURRENT_TIMESTAMP);
