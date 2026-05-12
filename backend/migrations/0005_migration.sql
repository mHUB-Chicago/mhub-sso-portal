CREATE TABLE "WebhookLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL DEFAULT 'peoplevine',
  "customerNo" INTEGER,
  "payload" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
