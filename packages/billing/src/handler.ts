import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@aila/db';
import { BillingConfigError, getPaystackSecretKey, getPaypalWebhookId, getWebhookSecretHash } from './env';
import { FlutterwaveError } from './flutterwave';
import { PAYPAL_WEBHOOK_HEADERS, verifyPaypalWebhook, type PaypalWebhookHeaders } from './paypal';
import { PAYSTACK_SIGNATURE_HEADER, verifyPaystackSignature } from './paystack';
import { PaymentProviderError } from './provider-error';
import {
  BillingRetryLater,
  processChargeEvent,
  processPaypalOrder,
  processPaystackCharge,
  processSubscriptionCancelledEvent,
  type ApplyResult,
} from './service';
import {
  MAX_WEBHOOK_BYTES,
  parseWebhook,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookEvent,
} from './webhook';

/**
 * The Aila Billing Webhook Handlers (AILA-V1-ARCHITECTURE §17,
 * PLATFORM-FOUNDATION §15, SECURITY-ARCHITECTURE §21, AC-161-162).
 *
 * 1. Authenticates the request: Flutterwave's `verif-hash` header and
 *    Paystack's HMAC-SHA512 signature in constant time; PayPal's signature
 *    through PayPal's verify-webhook-signature API.
 * 2. Validates the payload structure.
 * 3. Records the event under a unique provider event ID; an event already
 *    processed is acknowledged without being applied again.
 * 4. Re-reads the payment from the provider and applies it transactionally
 *    (service.ts).
 *
 * 200 tells the provider the event is handled; 500 makes it retry. Nothing
 * from the payload is logged.
 */

type Provider = 'FLUTTERWAVE' | 'PAYSTACK' | 'PAYPAL';

type ParsedEvent = {
  readonly eventId: string;
  readonly eventType: string;
  readonly payloadHash: string;
  readonly process: (requestId: string) => Promise<ApplyResult>;
};

function status(code: number, requestId: string): Response {
  return new Response(null, {
    status: code,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'P2002';
}

function errorText(error: unknown): string {
  return error instanceof BillingRetryLater ||
    error instanceof FlutterwaveError ||
    error instanceof PaymentProviderError ||
    error instanceof BillingConfigError
    ? error.message
    : error instanceof Error
      ? error.name
      : 'UnknownError';
}

function notConfigured(error: unknown, requestId: string): Response {
  console.error('[billing] Webhook is not configured', {
    requestId,
    error: error instanceof BillingConfigError ? error.message : 'UnknownError',
  });
  return status(500, requestId);
}

/** Reads the body with the size limit; null if it is too large. */
async function readBody(request: Request, requestId: string): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);

  if (declared > MAX_WEBHOOK_BYTES) {
    return null;
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    console.warn('[billing] Webhook rejected', { requestId, reason: 'PAYLOAD_TOO_LARGE' });
    return null;
  }

  return rawBody;
}

/** Steps 3 and 4: idempotent recording and processing of an authenticated event. */
async function recordAndProcess(provider: Provider, parsed: ParsedEvent, requestId: string): Promise<Response> {
  const db = getDb();
  let eventRecordId: string;

  try {
    const created = await db.billingEvent.create({
      data: {
        provider,
        providerEventId: parsed.eventId,
        eventType: parsed.eventType,
        payloadHash: parsed.payloadHash,
      },
      select: { id: true },
    });
    eventRecordId = created.id;
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await db.billingEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider, providerEventId: parsed.eventId } },
      select: { id: true, processedAt: true },
    });

    if (existing.processedAt) {
      return status(200, requestId);
    }

    // An earlier delivery failed part-way; applying again is safe.
    eventRecordId = existing.id;
  }

  try {
    const result = await parsed.process(requestId);

    await db.billingEvent.update({
      where: { id: eventRecordId },
      data: {
        processedAt: new Date(),
        errorCode: result.errorCode ?? null,
        accountId: result.accountId ?? null,
        subscriptionId: result.subscriptionId ?? null,
      },
    });

    return status(200, requestId);
  } catch (error) {
    const errorCode =
      error instanceof BillingRetryLater
        ? error.message
        : error instanceof FlutterwaveError || error instanceof PaymentProviderError
          ? 'PROVIDER_UNAVAILABLE'
          : error instanceof BillingConfigError
            ? 'BILLING_NOT_CONFIGURED'
            : 'PROCESSING_FAILED';

    console.error('[billing] Webhook processing failed; the provider will retry', {
      requestId,
      provider,
      eventType: parsed.eventType,
      errorCode,
      error: errorText(error),
    });

    await db.billingEvent
      .update({ where: { id: eventRecordId }, data: { errorCode } })
      .catch(() => undefined);

    return status(500, requestId);
  }
}

// ------------------------------------------------------------------
// Flutterwave
// ------------------------------------------------------------------

function processFlutterwaveEvent(event: WebhookEvent, requestId: string): Promise<ApplyResult> {
  switch (event.type) {
    case 'charge.completed':
      return processChargeEvent(event.transactionId, requestId);
    case 'subscription.cancelled':
      return processSubscriptionCancelledEvent(event.email, event.planId, requestId);
    default:
      return Promise.resolve({ outcome: 'IGNORED', errorCode: 'UNHANDLED_EVENT' });
  }
}

export async function handleFlutterwaveWebhook(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let secretHash: string;

  try {
    secretHash = getWebhookSecretHash();
  } catch (error) {
    return notConfigured(error, requestId);
  }

  if (!verifyWebhookSignature(request.headers.get(WEBHOOK_SIGNATURE_HEADER), secretHash)) {
    console.warn('[billing] Webhook rejected', { requestId, reason: 'INVALID_SIGNATURE' });
    return status(401, requestId);
  }

  const rawBody = await readBody(request, requestId);

  if (rawBody === null) {
    return status(413, requestId);
  }

  const parsed = parseWebhook(rawBody);

  if (!parsed) {
    console.warn('[billing] Webhook rejected', { requestId, reason: 'MALFORMED_PAYLOAD' });
    return status(400, requestId);
  }

  return recordAndProcess(
    'FLUTTERWAVE',
    { ...parsed, process: (id) => processFlutterwaveEvent(parsed.event, id) },
    requestId,
  );
}

// ------------------------------------------------------------------
// Paystack
// ------------------------------------------------------------------

const paystackEventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.object({
    id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reference: z.string().min(1).max(100),
    status: z.string().max(50).optional(),
  }).loose(),
});

export async function handlePaystackWebhook(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let secretKey: string;

  try {
    secretKey = getPaystackSecretKey();
  } catch (error) {
    return notConfigured(error, requestId);
  }

  const rawBody = await readBody(request, requestId);

  if (rawBody === null) {
    return status(413, requestId);
  }

  // The signature covers the exact raw body, so it is checked before parsing.
  if (!verifyPaystackSignature(rawBody, request.headers.get(PAYSTACK_SIGNATURE_HEADER), secretKey)) {
    console.warn('[billing] Webhook rejected', { requestId, provider: 'PAYSTACK', reason: 'INVALID_SIGNATURE' });
    return status(401, requestId);
  }

  let json: unknown;

  try {
    json = JSON.parse(rawBody);
  } catch {
    json = null;
  }

  const event = z.object({ event: z.string().min(1).max(100) }).loose().safeParse(json);

  if (!event.success) {
    console.warn('[billing] Webhook rejected', { requestId, provider: 'PAYSTACK', reason: 'MALFORMED_PAYLOAD' });
    return status(400, requestId);
  }

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const name = event.data.event;

  if (name !== 'charge.success') {
    return recordAndProcess(
      'PAYSTACK',
      {
        eventId: `${name}:${payloadHash}`,
        eventType: name,
        payloadHash,
        process: async () => ({ outcome: 'IGNORED', errorCode: 'UNHANDLED_EVENT' }),
      },
      requestId,
    );
  }

  const charge = paystackEventSchema.safeParse(json);

  if (!charge.success) {
    console.warn('[billing] Webhook rejected', { requestId, provider: 'PAYSTACK', reason: 'MALFORMED_PAYLOAD' });
    return status(400, requestId);
  }

  const { id, reference } = charge.data.data;

  return recordAndProcess(
    'PAYSTACK',
    {
      eventId: `${name}:${id}`,
      eventType: name,
      payloadHash,
      process: (rid) => processPaystackCharge(reference, rid),
    },
    requestId,
  );
}

// ------------------------------------------------------------------
// PayPal
// ------------------------------------------------------------------

const PAYPAL_ORDER_EVENTS = new Set(['CHECKOUT.ORDER.APPROVED', 'CHECKOUT.ORDER.COMPLETED']);
const PAYPAL_CAPTURE_EVENTS = new Set([
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.PENDING',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.DECLINED',
]);

const paypalEventSchema = z
  .object({
    id: z.string().min(1).max(100),
    event_type: z.string().min(1).max(100),
    resource: z
      .object({
        id: z.string().max(100).optional(),
        supplementary_data: z
          .object({ related_ids: z.object({ order_id: z.string().max(100).optional() }).loose() })
          .loose()
          .optional(),
      })
      .loose(),
  })
  .loose();

/** The order an event is about; null for events Aila does not act on. */
export function paypalOrderId(event: z.infer<typeof paypalEventSchema>): string | null {
  if (PAYPAL_ORDER_EVENTS.has(event.event_type)) {
    return event.resource.id ?? null;
  }

  if (PAYPAL_CAPTURE_EVENTS.has(event.event_type)) {
    return event.resource.supplementary_data?.related_ids.order_id ?? null;
  }

  return null;
}

export async function handlePaypalWebhook(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    getPaypalWebhookId();
  } catch (error) {
    return notConfigured(error, requestId);
  }

  const headers = Object.fromEntries(
    Object.entries(PAYPAL_WEBHOOK_HEADERS).map(([key, header]) => [key, request.headers.get(header)]),
  ) as PaypalWebhookHeaders;

  if (Object.values(headers).some((value) => !value)) {
    console.warn('[billing] Webhook rejected', { requestId, provider: 'PAYPAL', reason: 'INVALID_SIGNATURE' });
    return status(401, requestId);
  }

  const rawBody = await readBody(request, requestId);

  if (rawBody === null) {
    return status(413, requestId);
  }

  let json: unknown;

  try {
    json = JSON.parse(rawBody);
  } catch {
    json = null;
  }

  const event = paypalEventSchema.safeParse(json);

  if (!event.success) {
    console.warn('[billing] Webhook rejected', { requestId, provider: 'PAYPAL', reason: 'MALFORMED_PAYLOAD' });
    return status(400, requestId);
  }

  let verified: boolean;

  try {
    verified = await verifyPaypalWebhook(headers, json);
  } catch (error) {
    // PayPal could not be asked; it retries the delivery.
    console.error('[billing] Webhook verification failed; PayPal will retry', {
      requestId,
      error: errorText(error),
    });
    return status(500, requestId);
  }

  if (!verified) {
    console.warn('[billing] Webhook rejected', { requestId, provider: 'PAYPAL', reason: 'INVALID_SIGNATURE' });
    return status(401, requestId);
  }

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const orderId = paypalOrderId(event.data);

  return recordAndProcess(
    'PAYPAL',
    {
      eventId: event.data.id,
      eventType: event.data.event_type,
      payloadHash,
      process: (rid) =>
        orderId
          ? processPaypalOrder(orderId, rid)
          : Promise.resolve({ outcome: 'IGNORED', errorCode: 'UNHANDLED_EVENT' }),
    },
    requestId,
  );
}
