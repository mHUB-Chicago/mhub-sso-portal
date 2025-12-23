-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "peopleVineId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "peopleVineId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" JSONB,
    "lastLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "acsUrl" TEXT NOT NULL,
    "nameIdFormat" TEXT,
    "nameIdSource" TEXT NOT NULL DEFAULT 'email',
    "signTarget" TEXT NOT NULL DEFAULT 'ASSERTION',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserServiceProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serviceProviderId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserServiceProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserServiceProvider_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SamlAuthRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceProviderId" TEXT NOT NULL,
    "userId" TEXT,
    "inResponseTo" TEXT NOT NULL,
    "acsUrl" TEXT NOT NULL,
    "relayState" TEXT,
    "requestBinding" TEXT NOT NULL DEFAULT 'HTTP_REDIRECT',
    "responseBinding" TEXT NOT NULL DEFAULT 'HTTP_POST',
    "expiresAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SamlAuthRequest_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SamlAuthRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PeopleVineToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenType" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_peopleVineId_key" ON "Company"("peopleVineId");

-- CreateIndex
CREATE UNIQUE INDEX "User_peopleVineId_key" ON "User"("peopleVineId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProvider_entityId_key" ON "ServiceProvider"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "UserServiceProvider_userId_serviceProviderId_key" ON "UserServiceProvider"("userId", "serviceProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "SamlAuthRequest_serviceProviderId_inResponseTo_key" ON "SamlAuthRequest"("serviceProviderId", "inResponseTo");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionId_key" ON "Session"("sessionId");
