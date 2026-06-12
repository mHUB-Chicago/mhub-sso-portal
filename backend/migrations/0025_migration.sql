CREATE TABLE "SyncExportBlob" (
  "sessionId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("sessionId", "key")
);
