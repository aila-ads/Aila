-- Step 9: Aila Pro billing with Flutterwave (DATABASE-SCHEMA §12-15,
-- DATA-ARCHITECTURE §11-14, SECURITY-ARCHITECTURE §21).
-- Additive only: one new enum, one new table and one nullable column.
-- Existing rows are not changed and need no backfill.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "BillingEvent" ADD COLUMN     "errorCode" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "provider" "BillingProvider" NOT NULL,
    "txRef" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "plan" "PlanCode" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_provider_txRef_idx" ON "Payment"("provider", "txRef");

-- CreateIndex
CREATE INDEX "Payment_accountId_status_createdAt_idx" ON "Payment"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerTransactionId_key" ON "Payment"("provider", "providerTransactionId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint: Prisma cannot express CHECK constraints. A charge is
-- positive and in an ISO 4217 currency code. The table is new, so no
-- existing row is checked.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_iso_check" CHECK ("currency" ~ '^[A-Z]{3}$');
