INSERT OR IGNORE INTO "User" ("id", "name", "email", "passwordHashed", "role", "emailVerified", "mustResetPassword", "active", "companyId", "createdAt", "updatedAt")
VALUES (
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
  'Mark Ranny Aglapay',
  'aglapay.markranny@gmail.com',
  'b03ddf3ca2e714a6548e7495e2a03f5e824eaac9837cd7f159c67b90fb4b7342',
  'ADMIN',
  1,
  0,
  1,
  (SELECT "id" FROM "Company" WHERE "name" = 'AXSmodern' LIMIT 1),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
