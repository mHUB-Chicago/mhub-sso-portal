-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "peopleVineId" TEXT NOT NULL,
    "pvCustomerId" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT,
    "rate" REAL,
    "frequency" TEXT,
    "pricing" TEXT,
    "lastDate" DATETIME,
    "nextDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_peopleVineId_key" ON "Subscription"("peopleVineId");

-- CreateIndex
CREATE INDEX "Subscription_companyId_idx" ON "Subscription"("companyId");
