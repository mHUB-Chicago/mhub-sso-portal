-- Add all missing add-on types from Sheet1 col3=Yes
INSERT OR IGNORE INTO "AddonSubscriptionType" ("name", "createdAt") VALUES
  ('Accelerator Shared Workspace',                 CURRENT_TIMESTAMP),
  ('Active EIR Workbook User',                     CURRENT_TIMESTAMP),
  ('Curriculum Instructor',                        CURRENT_TIMESTAMP),
  ('Equity & Innovation Scholarship',              CURRENT_TIMESTAMP),
  ('Fabrication Customer',                         CURRENT_TIMESTAMP),
  ('Hardtech Development Consultants/Contractors', CURRENT_TIMESTAMP),
  ('Landis Family Fellowship',                     CURRENT_TIMESTAMP),
  ('Mentee Program',                               CURRENT_TIMESTAMP),
  ('Mentorship Program',                           CURRENT_TIMESTAMP),
  ('mHUB Board of Directors',                      CURRENT_TIMESTAMP),
  ('mHUB Community',                               CURRENT_TIMESTAMP),
  ('mHUB Executive Committee',                     CURRENT_TIMESTAMP),
  ('mHUB Staff',                                   CURRENT_TIMESTAMP),
  ('mHUB Venture Board',                           CURRENT_TIMESTAMP),
  ('mPOWER Program',                               CURRENT_TIMESTAMP),
  ('Punch Card Membership',                        CURRENT_TIMESTAMP);

-- Users where primaryMembership is an add-on but addOns already contains it — just clear primaryMembership
UPDATE "User"
SET "primaryMembership" = NULL
WHERE "primaryMembership" IN (
  'Accelerator Shared Workspace', 'Active EIR Workbook User', 'Curriculum Instructor',
  'Equity & Innovation Scholarship', 'Fabrication Customer',
  'Hardtech Development Consultants/Contractors', 'Landis Family Fellowship',
  'Mentee Program', 'Mentorship Program', 'mHUB Board of Directors',
  'mHUB Community', 'mHUB Executive Committee', 'mHUB Staff',
  'mHUB Venture Board', 'mPOWER Program', 'Punch Card Membership'
) AND "addOns" != '[]';

-- Users with empty addOns — move primaryMembership into addOns
UPDATE "User"
SET "addOns" = '["' || "primaryMembership" || '"]',
    "primaryMembership" = NULL
WHERE "primaryMembership" IN (
  'Accelerator Shared Workspace', 'Active EIR Workbook User', 'Curriculum Instructor',
  'Equity & Innovation Scholarship', 'Fabrication Customer',
  'Hardtech Development Consultants/Contractors', 'Landis Family Fellowship',
  'Mentee Program', 'Mentorship Program', 'mHUB Board of Directors',
  'mHUB Community', 'mHUB Executive Committee', 'mHUB Staff',
  'mHUB Venture Board', 'mPOWER Program', 'Punch Card Membership'
) AND "addOns" = '[]';
