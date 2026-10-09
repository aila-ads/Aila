import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getPaystackSecretKey } from './env';
import { PaymentProviderError, PROVIDER_TIMEOUT_MS, type VerifiedCharge } from './provider-error';

/**
 * Paystack REST client and webhook signature check: the only code that
 * knows Paystack. Live secret key only, read at call time. Customers pay on
 * Paystack's hosted page, so no card data or third-party script reaches
 * Aila. Nothing is logged except IDs and status codes.
 */

const API = 'https://api.paystack.co';

/** Every Paystack channel Aila offers; Paystack shows those enabled for the currency. */
export const PAYSTACK_CHANNELS = [
  'card',
  'bank',
  'ussd',
  'qr',
  'mobile_money',
  'bank_transfer',
  'apple_pay',
] as const;

export const PAYSTACK_SIGNATURE_HEADER = 'x-paystack-signature';

async function call<T extends z.ZodType>(
  operation: string,
  path: string,
  schema: T,
  body?: unknown,
): Promise<z.infer<T>> {
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PaymentProviderError('Paystack', 'UNAVAILABLE', operation);
  }

  if (!response.ok) {
    const kind = response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED';
    throw new PaymentProviderError('Paystack', kind, operation, response.status);
  }

  const parsed = z
    .object({ status: z.literal(true), data: schema })
    .safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new PaymentProviderError('Paystack', 'REJECTED', operation, response.status);
  }

  return (parsed.data as { data: z.infer<T> }).data;
}

export type PaystackCheckoutRequest = {
  readonly reference: string;
  /** In minor units (kobo for NGN). */
  readonly amountMinor: number;
  readonly currency: string;
  readonly email: string;
  readonly callbackUrl: string;
  /** Where Paystack sends the customer who closes the checkout. */
  readonly cancelUrl: string;
};

/** Initializes a transaction and returns Paystack's hosted checkout link. */
export async function initializePaystackTransaction(request: PaystackCheckoutRequest): Promise<string> {
  const data = await call(
    'initialize transaction',
    '/transaction/initialize',
    z.object({ authorization_url: z.url({ protocol: /^https$/ }), reference: z.string() }),
    {
      email: request.email,
      amount: String(request.amountMinor),
      currency: request.currency,
      reference: request.reference,
      callback_url: request.callbackUrl,
      channels: PAYSTACK_CHANNELS,
      metadata: { product: 'AILA_PRO', months: 1, cancel_action: request.cancelUrl },
    },
  );

  if (data.reference !== request.reference) {
    throw new PaymentProviderError('Paystack', 'REJECTED', 'initialize transaction');
  }

  return data.authorization_url;
}

const transactionSchema = z.object({
  id: z.number().int().positive(),
  status: z.string(),
  reference: z.string().min(1),
  /** Minor units. */
  amount: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paid_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

/** Paystack statuses: success, failed, abandoned, reversed; anything else is not final. */
export function mapPaystackStatus(status: string): VerifiedCharge['status'] {
  if (status === 'success') return 'SUCCEEDED';
  if (status === 'failed' || status === 'abandoned' || status === 'reversed') return 'FAILED';
  return 'PENDING';
}

/** The transaction as recorded by Paystack (verify by reference). */
export async function verifyPaystackTransaction(reference: string): Promise<VerifiedCharge> {
  if (!/^[A-Za-z0-9._=-]{1,100}$/.test(reference)) {
    throw new PaymentProviderError('Paystack', 'REJECTED', 'verify transaction');
  }

  const data = await call(
    'verify transaction',
    `/transaction/verify/${encodeURIComponent(reference)}`,
    transactionSchema,
  );
  const paidAt = new Date(data.paid_at ?? data.created_at ?? Number.NaN);

  if (Number.isNaN(paidAt.getTime())) {
    throw new PaymentProviderError('Paystack', 'REJECTED', 'verify transaction');
  }

  return {
    provider: 'PAYSTACK',
    providerTransactionId: String(data.id),
    txRef: data.reference,
    amount: (data.amount / 100).toFixed(2),
    currency: data.currency,
    status: mapPaystackStatus(data.status),
    paidAt,
  };
}

/**
 * Paystack signs each webhook with HMAC-SHA512 of the raw body keyed by the
 * secret key, hex-encoded in x-paystack-signature. Compared in constant time.
 */
export function verifyPaystackSignature(rawBody: string, header: string | null, secretKey: string): boolean {
  if (!header || !secretKey || !/^[0-9a-f]{128}$/i.test(header)) {
    return false;
  }

  const expected = createHmac('sha512', secretKey).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(header, 'hex'), expected);
}
