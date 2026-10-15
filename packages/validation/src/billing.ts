import { z } from 'zod';

/**
 * Billing input (SECURITY-ARCHITECTURE §21). The client chooses only the
 * payment method, and sends back the value the provider put in the return
 * URL; that value is a lookup key, verified with the provider before
 * anything changes.
 */
export const startCheckoutSchema = z.object({
  method: z.enum(['FLUTTERWAVE', 'PAYSTACK', 'PAYPAL', 'FLUTTERWAVE_CARD_PLAN']),
});

export type StartCheckoutInput = z.input<typeof startCheckoutSchema>;

export const confirmCheckoutSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('FLUTTERWAVE'),
    transactionId: z
      .string()
      .regex(/^[1-9][0-9]{0,15}$/)
      .transform(Number),
  }),
  z.object({
    provider: z.literal('PAYSTACK'),
    reference: z.string().regex(/^aila-[0-9a-f-]{36}$/),
  }),
  z.object({
    provider: z.literal('PAYPAL'),
    orderId: z.string().regex(/^[A-Z0-9]{1,36}$/),
  }),
]);

export type ConfirmCheckoutInput = z.input<typeof confirmCheckoutSchema>;
