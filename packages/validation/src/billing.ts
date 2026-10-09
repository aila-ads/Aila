import { z } from 'zod';

/**
 * Billing input (SECURITY-ARCHITECTURE §21). The only client input is the
 * transaction ID Flutterwave puts in the return URL; it is a lookup key,
 * verified with Flutterwave before anything changes.
 */
export const confirmCheckoutSchema = z.object({
  transactionId: z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .transform(Number),
});

export type ConfirmCheckoutInput = z.input<typeof confirmCheckoutSchema>;
