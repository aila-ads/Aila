-- Aila Pro with every payment method: one-month purchases through
-- Flutterwave, Paystack and PayPal next to the Flutterwave card plan.
-- Additive only: two enum values and one column with a default. Existing
-- rows keep their meaning (false: the card plan's checkout and renewals)
-- and need no backfill.

-- AlterEnum
ALTER TYPE "BillingProvider" ADD VALUE 'PAYSTACK';

-- AlterEnum
ALTER TYPE "BillingProvider" ADD VALUE 'PAYPAL';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "oneTime" BOOLEAN NOT NULL DEFAULT false;
