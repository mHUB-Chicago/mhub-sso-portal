-- Add missing primary subscription type from sheet
INSERT OR IGNORE INTO "PrimarySubscriptionType" ("name", "createdAt") VALUES
  ('Social Membership', CURRENT_TIMESTAMP);

-- Fix addon subscription types: remove incorrect entries, add sheet-defined add-ons
DELETE FROM "AddonSubscriptionType" WHERE "name" IN (
  'Accelerator Shared Workspace',
  'Active EIR Workbook User'
);

INSERT OR IGNORE INTO "AddonSubscriptionType" ("name", "createdAt") VALUES
  ('Parking, paid for by member', CURRENT_TIMESTAMP),
  ('Storage - Large Shelf',       CURRENT_TIMESTAMP);
