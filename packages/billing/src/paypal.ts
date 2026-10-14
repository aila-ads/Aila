import { z } from 'zod';
import { getPaypalConfig, getPaypalWebhookId } from './env';
import { PaymentProviderError, PROVIDER_TIMEOUT_MS, type VerifiedCharge } from './provider-error';

/**
 * PayPal Orders v2 client and webhook verification: the only code that
 * knows PayPal. Always the live API. The customer approves the order on
 * PayPal's page (PayPal balance, cards, Pay Later where PayPal offers it);
 * Aila captures it on the server. Nothing is logged except IDs and status
 * codes.
 */

const API = 'https://api-m.paypal.com';

export const PAYPAL_WEBHOOK_HEADERS = {
  authAlgo: 'paypal-auth-algo',
  certUrl: 'paypal-cert-url',
  transmissionId: 'paypal-transmission-id',
  transmissionSig: 'paypal-transmission-sig',
  transmissionTime: 'paypal-transmission-time',
} as const;

let cachedToken: { readonly value: string; readonly expiresAt: number } | null = null;

/** For tests: forget the cached access token. */
export function resetPaypalToken(): void {
  cachedToken = null;
}

async function send(operation: string, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PaymentProviderError('PayPal', 'UNAVAILABLE', operation);
  }
}

async function failure(operation: string, response: Response): Promise<PaymentProviderError> {
  const kind = response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED';
  const body = z
    .object({ details: z.array(z.object({ issue: z.string() })).optional() })
    .safeParse(await response.json().catch(() => null));
  const issue = body.success ? (body.data.details?.[0]?.issue ?? null) : null;
  return new PaymentProviderError('PayPal', kind, operation, response.status, issue);
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const { clientId, clientSecret } = getPaypalConfig();
  const response = await send('get access token', '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw await failure('get access token', response);
  }

  const parsed = z
    .object({ access_token: z.string().min(1), expires_in: z.number().positive() })
    .safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new PaymentProviderError('PayPal', 'REJECTED', 'get access token', response.status);
  }

  // Renewed a minute early so a token never expires mid-request.
  cachedToken = {
    value: parsed.data.access_token,
    expiresAt: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

async function call<T extends z.ZodType>(
  operation: string,
  path: string,
  schema: T,
  init: { method?: 'GET' | 'POST'; body?: unknown; requestId?: string } = {},
): Promise<z.infer<T>> {
  const response = await send(operation, path, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      // PayPal's idempotency key: a retried request returns the first result.
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    throw await failure(operation, response);
  }

  const parsed = schema.safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    throw new PaymentProviderError('PayPal', 'REJECTED', operation, response.status);
  }

  return parsed.data;
}

export type PaypalOrderRequest = {
  readonly txRef: string;
  /** Decimal string with two places, e.g. 4.00. */
  readonly amount: string;
  readonly currency: string;
  readonly returnUrl: string;
  readonly cancelUrl: string;
};

/** Creates an order and returns its ID and the link where the customer approves it. */
export async function createPaypalOrder(
  request: PaypalOrderRequest,
): Promise<{ readonly orderId: string; readonly approveUrl: string }> {
  const order = await call(
    'create order',
    '/v2/checkout/orders',
    z.object({
      id: z.string().min(1),
      links: z.array(z.object({ rel: z.string(), href: z.url({ protocol: /^https$/ }) })),
    }),
    {
      method: 'POST',
      requestId: request.txRef,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'AILA_PRO',
            custom_id: request.txRef,
            invoice_id: request.txRef,
            description: 'Aila Pro, one month',
            amount: { currency_code: request.currency, value: request.amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Aila',
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: request.returnUrl,
              cancel_url: request.cancelUrl,
            },
          },
        },
      },
    },
  );
  const approve = order.links.find((link) => link.rel === 'payer-action' || link.rel === 'approve');

  if (!approve || !isPaypalUrl(approve.href)) {
    throw new PaymentProviderError('PayPal', 'REJECTED', 'create order');
  }

  return { orderId: order.id, approveUrl: approve.href };
}

export function isPaypalUrl(link: string): boolean {
  const url = new URL(link);
  return url.protocol === 'https:' && (url.hostname === 'www.paypal.com' || url.hostname === 'paypal.com');
}

const captureSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  amount: z.object({ currency_code: z.string().regex(/^[A-Z]{3}$/), value: z.string() }),
  create_time: z.string().optional(),
  update_time: z.string().optional(),
});

const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  create_time: z.string().optional(),
  purchase_units: z
    .array(
      z.object({
        custom_id: z.string().optional(),
        invoice_id: z.string().optional(),
        amount: z.object({ currency_code: z.string().regex(/^[A-Z]{3}$/), value: z.string() }).optional(),
        payments: z.object({ captures: z.array(captureSchema).optional() }).optional(),
      }),
    )
    .min(1),
});

type PaypalOrder = z.infer<typeof orderSchema>;

/**
 * Maps an order to Aila's terms. The amount and currency are the captured
 * ones once a capture exists, otherwise the order's. COMPLETED captures are
 * paid; DECLINED or FAILED captures and VOIDED orders are failed; anything
 * else (not approved yet, capture pending) is not final.
 */
export function orderCharge(order: PaypalOrder): VerifiedCharge {
  const unit = order.purchase_units[0];
  const capture = unit.payments?.captures?.[0];
  const amount = capture?.amount ?? unit.amount;
  const txRef = unit.custom_id ?? unit.invoice_id ?? '';
  let status: VerifiedCharge['status'] = 'PENDING';

  if (capture) {
    status =
      capture.status === 'COMPLETED'
        ? 'SUCCEEDED'
        : capture.status === 'DECLINED' || capture.status === 'FAILED'
          ? 'FAILED'
          : 'PENDING';
  } else if (order.status === 'VOIDED') {
    status = 'FAILED';
  }

  const paidAt = new Date(capture?.create_time ?? capture?.update_time ?? order.create_time ?? Date.now());

  if (!amount || !txRef || Number.isNaN(paidAt.getTime())) {
    throw new PaymentProviderError('PayPal', 'REJECTED', 'read order');
  }

  return {
    provider: 'PAYPAL',
    providerTransactionId: order.id,
    txRef,
    amount: amount.value,
    currency: amount.currency_code,
    status,
    paidAt,
  };
}

function checkOrderId(orderId: string, operation: string): void {
  if (!/^[A-Z0-9]{1,36}$/.test(orderId)) {
    throw new PaymentProviderError('PayPal', 'REJECTED', operation);
  }
}

export async function getPaypalOrder(orderId: string): Promise<PaypalOrder> {
  checkOrderId(orderId, 'get order');
  return call('get order', `/v2/checkout/orders/${orderId}`, orderSchema);
}

/**
 * Captures an approved order on the server and returns the verified result.
 * Safe to repeat: an order already captured is read back instead.
 */
export async function capturePaypalOrder(orderId: string): Promise<VerifiedCharge> {
  checkOrderId(orderId, 'capture order');
  const order = await getPaypalOrder(orderId);

  if (order.status !== 'APPROVED') {
    return orderCharge(order);
  }

  try {
    return orderCharge(
      await call('capture order', `/v2/checkout/orders/${orderId}/capture`, orderSchema, {
        method: 'POST',
        body: {},
        requestId: `capture-${orderId}`,
      }),
    );
  } catch (error) {
    if (error instanceof PaymentProviderError && error.issue === 'ORDER_ALREADY_CAPTURED') {
      return orderCharge(await getPaypalOrder(orderId));
    }

    // PayPal refused the capture (for example INSTRUMENT_DECLINED): not paid.
    if (error instanceof PaymentProviderError && error.status === 422) {
      return { ...orderCharge(order), status: 'FAILED' };
    }

    throw error;
  }
}

export type PaypalWebhookHeaders = Record<keyof typeof PAYPAL_WEBHOOK_HEADERS, string | null>;

/**
 * Asks PayPal to verify a webhook's signature against the registered
 * webhook ID (POST /v1/notifications/verify-webhook-signature).
 */
export async function verifyPaypalWebhook(headers: PaypalWebhookHeaders, event: unknown): Promise<boolean> {
  const values = Object.values(headers);

  if (values.some((value) => !value || value.length > 2048)) {
    return false;
  }

  if (!URL.canParse(headers.certUrl ?? '')) {
    return false;
  }

  const certUrl = new URL(headers.certUrl ?? '');

  if (certUrl.protocol !== 'https:' || !(certUrl.hostname === 'api.paypal.com' || certUrl.hostname.endsWith('.paypal.com'))) {
    return false;
  }

  const result = await call(
    'verify webhook',
    '/v1/notifications/verify-webhook-signature',
    z.object({ verification_status: z.string() }),
    {
      method: 'POST',
      body: {
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: getPaypalWebhookId(),
        webhook_event: event,
      },
    },
  );

  return result.verification_status === 'SUCCESS';
}
