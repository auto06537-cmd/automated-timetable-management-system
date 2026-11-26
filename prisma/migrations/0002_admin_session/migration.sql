BEGIN;

CREATE TABLE "AdminSession" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "adminId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId")
    REFERENCES "Admin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession" ("adminId");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession" ("expiresAt");

COMMIT;
