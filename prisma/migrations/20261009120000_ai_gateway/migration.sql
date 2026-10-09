-- Step 8: AI gateway usage accounting (DATABASE-SCHEMA §18, AI-GATEWAY §28).
-- Additive only: one new enum, three nullable columns and one index.
-- Existing rows are not changed and need no backfill.

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('SUCCESS', 'FAILURE', 'CANCELLED');

-- AlterTable
ALTER TABLE "UsageRecord" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "operation" TEXT,
ADD COLUMN     "status" "UsageStatus";

-- CreateIndex: per-account usage-limit counts (AI-GATEWAY §14).
CREATE INDEX "UsageRecord_accountId_usageType_createdAt_idx" ON "UsageRecord"("accountId", "usageType", "createdAt");
