import { z } from 'zod';
import { getFlutterwaveSecretKey } from './env';

/**
 * Flutterwave v3 REST client (PLATFORM-FOUNDATION §13,
 * APPLICATION-ARCHITECTURE §17): the only code that knows Flutterwave.
 * Plain fetch with the live secret key, read at call time. Responses are
 * validated before use; nothing from them is logged except IDs and status
 * codes, never card details, emails or keys (SECURITY-ARCHITECTURE §24).
 */

const API = 'https://api.flutterwave.com/v3';
const TIMEOUT_MS = 15_000;
const MAX_SUBSCRIPTION_PAGES = 5;

/**
 * UNAVAILABLE: network failure, timeout, 429 or 5xx; safe to retry.
 * REJECTED: Flutterwave refused the request or answered with an
 * unexpected body.
 */
export class FlutterwaveError extends Error {
  readonly kind: 'UNAVAILABLE' | 'REJECTED';
  readonly status: number | null;

  constructor(kind: 'UNAVAILABLE' | 'REJECTED', operation: string, status: number | null = null) {
    super(`Flutterwave ${operation} failed (${kind}${status === null ? '' : `, HTTP ${status}`})`);
    this.name = 'FlutterwaveError';
    this.kind = kind;
    this.status = status;
  }
}

const amountSchema = z.coerce.number().positive().finite();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

const planSchema = z.object({
  id: z.number().int().positive(),
  amount: amountSchema,
  currency: currencySchema,
  interval: z.string(),
  status: z.string(),
});

export type FlutterwavePlan = z.infer<typeof planSchema>;

const transactionSchema = z.object({
  id: z.number().int().positive(),
  tx_ref: z.string().min(1),
  amount: amountSchema,
  currency: currencySchema,
  status: z.string(),
  created_at: z.string().min(1),
  customer: z.object({ email: z.string().min(1) }).optional(),
});

export type FlutterwaveTransaction = {
  readonly id: number;
  readonly txRef: string;
  readonly amount: number;
  readonly currency: string;
  /** successful, failed or pending, as reported by Flutterwave. */
  readonly status: string;
  readonly createdAt: Date;
  readonly customerEmail: string | null;
};

const subscriptionSchema = z.object({
  id: z.number().int().positive(),
  plan: z.coerce.number().int(),
  status: z.string(),
  customer: z.object({
    id: z.number().int().positive(),
    customer_email: z.string().optional(),
  }),
});

export type FlutterwaveSubscription = {
  readonly id: string;
  readonly customerId: string;
  readonly customerEmail: string | null;
  readonly planId: number;
  /** active or cancelled. */
  readonly status: string;
};

function envelope<T extends z.ZodType>(data: T) {
  return z.object({ status: z.literal('success'), data });
}

async function call<T extends z.ZodType>(
  operation: string,
  path: string,
  schema: T,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<z.infer<T>> {
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${getFlutterwaveSecretKey()}`,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new FlutterwaveError('UNAVAILABLE', operation);
  }

  if (!response.ok) {
    const kind = response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED';
    throw new FlutterwaveError(kind, operation, response.status);
  }

  const parsed = schema.safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new FlutterwaveError('REJECTED', operation, response.status);
  }

  return parsed.data;
}

/** The payment plan's amount, currency, interval and status. */
export async function getPlan(planId: number): Promise<FlutterwavePlan> {
  const result = await call('get plan', `/payment-plans/${planId}`, envelope(planSchema));
  return result.data;
}

export type CheckoutRequest = {
  readonly txRef: string;
  readonly amount: number;
  readonly currency: string;
  readonly planId: number;
  readonly redirectUrl: string;
  readonly email: string;
  readonly name: string | null;
  readonly sessionMinutes: number;
};

/**
 * Creates a Flutterwave Standard hosted checkout subscribed to the payment
 * plan, and returns its link. The customer pays on Flutterwave's page, so
 * no card details reach Aila and no third-party script runs on Aila.
 */
export async function createCheckout(request: CheckoutRequest): Promise<string> {
  const result = await call(
    'create checkout',
    '/payments',
    envelope(z.object({ link: z.url({ protocol: /^https$/ }) })),
    {
      method: 'POST',
      body: {
        tx_ref: request.txRef,
        amount: request.amount,
        currency: request.currency,
        payment_plan: request.planId,
        redirect_url: request.redirectUrl,
        customer: { email: request.email, ...(request.name ? { name: request.name } : {}) },
        customizations: { title: 'Aila Pro' },
        configurations: { session_duration: request.sessionMinutes },
      },
    },
  );

  return result.data.link;
}

/** The transaction as recorded by Flutterwave (verify by ID). */
export async function verifyTransaction(transactionId: number): Promise<FlutterwaveTransaction> {
  const { data } = await call(
    'verify transaction',
    `/transactions/${transactionId}/verify`,
    envelope(transactionSchema),
  );
  const createdAt = new Date(data.created_at);

  if (Number.isNaN(createdAt.getTime())) {
    throw new FlutterwaveError('REJECTED', 'verify transaction');
  }

  return {
    id: data.id,
    txRef: data.tx_ref,
    amount: data.amount,
    currency: data.currency,
    status: data.status,
    createdAt,
    customerEmail: data.customer?.email ?? null,
  };
}

/** Subscriptions on the plan matching a transaction ID or a customer email. */
export async function findSubscriptions(
  filter: { readonly planId: number; readonly status?: 'active' | 'cancelled' } & (
    | { readonly transactionId: number }
    | { readonly email: string }
  ),
): Promise<FlutterwaveSubscription[]> {
  const found: FlutterwaveSubscription[] = [];
  const schema = envelope(z.array(subscriptionSchema)).extend({
    meta: z
      .object({ page_info: z.object({ total_pages: z.coerce.number().int().nonnegative() }) })
      .optional(),
  });

  for (let page = 1; page <= MAX_SUBSCRIPTION_PAGES; page += 1) {
    const query = new URLSearchParams({ plan: String(filter.planId), page: String(page) });

    if ('transactionId' in filter) {
      query.set('transaction_id', String(filter.transactionId));
    } else {
      query.set('email', filter.email);
    }

    if (filter.status) {
      query.set('status', filter.status);
    }

    const result = await call('find subscriptions', `/subscriptions?${query}`, schema);

    for (const item of result.data) {
      if (item.plan === filter.planId) {
        found.push({
          id: String(item.id),
          customerId: String(item.customer.id),
          customerEmail: item.customer.customer_email ?? null,
          planId: item.plan,
          status: item.status,
        });
      }
    }

    if (page >= (result.meta?.page_info.total_pages ?? 1)) {
      break;
    }
  }

  return found;
}

/** Stops future charges for one subscription. */
export async function cancelProviderSubscription(subscriptionId: string): Promise<void> {
  if (!/^[1-9][0-9]*$/.test(subscriptionId)) {
    throw new FlutterwaveError('REJECTED', 'cancel subscription');
  }

  await call(
    'cancel subscription',
    `/subscriptions/${subscriptionId}/cancel`,
    z.object({ status: z.literal('success') }),
    { method: 'PUT' },
  );
}
