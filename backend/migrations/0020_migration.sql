CREATE TABLE "FreeMemberExclusionType" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "FreeMemberExclusionType" ("name", "createdAt") VALUES
  ('Reserved Desk', CURRENT_TIMESTAMP);
