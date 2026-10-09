import { randomUUID } from 'node:crypto';
import { getDb } from '@aila/db';
import { BillingConfigError, getWebhookSecretHash } from './env';
import { FlutterwaveError } from './flutterwave';
import {
  BillingRetryLater,
  processChargeEvent,
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
 * The Aila Billing Webhook Handler (AILA-V1-ARCHITECTURE §17,
 * PLATFORM-FOUNDATION §15, SECURITY-ARCHITECTURE §21, AC-161-162).
 *
 * 1. Authenticates the `verif-hash` header in constant time.
 * 2. Validates the payload structure.
 * 3. Records the event under a unique provider event ID; an event already
 *    processed is acknowledged without being applied again.
 * 4. Re-reads the transaction from Flutterwave and applies it
 *    transactionally (service.ts).
 *
 * 200 tells Flutterwave the event is handled; 500 makes it retry (three
 * times, 30 minutes apart). Nothing from the payload is logged.
 */

const PROVIDER = 'FLUTTERWAVE';

function status(code: number, requestId: string): Response {
  return new Response(null, {
    status: code,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'P2002';
}

async function processEvent(event: WebhookEvent, requestId: string): Promise<ApplyResult> {
  switch (event.type) {
    case 'charge.completed':
      return processChargeEvent(event.transactionId, requestId);
    case 'subscription.cancelled':
      return processSubscriptionCancelledEvent(event.email, event.planId, requestId);
    default:
      return { outcome: 'IGNORED', errorCode: 'UNHANDLED_EVENT' };
  }
}

export async function handleFlutterwaveWebhook(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let secretHash: string;

  try {
    secretHash = getWebhookSecretHash();
  } catch (error) {
    console.error('[billing] Webhook is not configured', {
      requestId,
      error: error instanceof BillingConfigError ? error.message : 'UnknownError',
    });
    return status(500, requestId);
  }

  if (!verifyWebhookSignature(request.headers.get(WEBHOOK_SIGNATURE_HEADER), secretHash)) {
    console.warn('[billing] Webhook rejected', { requestId, reason: 'INVALID_SIGNATURE' });
    return status(401, requestId);
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    console.warn('[billing] Webhook rejected', { requestId, reason: 'PAYLOAD_TOO_LARGE' });
    return status(413, requestId);
  }

  const parsed = parseWebhook(rawBody);

  if (!parsed) {
    console.warn('[billing] Webhook rejected', { requestId, reason: 'MALFORMED_PAYLOAD' });
    return status(400, requestId);
  }

  const db = getDb();
  let eventRecordId: string;

  try {
    const created = await db.billingEvent.create({
      data: {
        provider: PROVIDER,
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
      where: { provider_providerEventId: { provider: PROVIDER, providerEventId: parsed.eventId } },
      select: { id: true, processedAt: true },
    });

    if (existing.processedAt) {
      return status(200, requestId);
    }

    // An earlier delivery failed part-way; applying again is safe.
    eventRecordId = existing.id;
  }

  try {
    const result = await processEvent(parsed.event, requestId);

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
        : error instanceof FlutterwaveError
          ? 'PROVIDER_UNAVAILABLE'
          : error instanceof BillingConfigError
            ? 'BILLING_NOT_CONFIGURED'
            : 'PROCESSING_FAILED';

    console.error('[billing] Webhook processing failed; Flutterwave will retry', {
      requestId,
      eventType: parsed.eventType,
      errorCode,
      error:
        error instanceof BillingRetryLater ||
        error instanceof FlutterwaveError ||
        error instanceof BillingConfigError
          ? error.message
          : error instanceof Error
            ? error.name
            : 'UnknownError',
    });

    await db.billingEvent
      .update({ where: { id: eventRecordId }, data: { errorCode } })
      .catch(() => undefined);

    return status(500, requestId);
  }
}
