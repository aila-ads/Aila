import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Flutterwave webhook authentication and parsing (SECURITY-ARCHITECTURE
 * §21.1 steps 1-2, AC-161). Flutterwave sends the secret hash set on the
 * webhook in the `verif-hash` header.
 */

export const WEBHOOK_SIGNATURE_HEADER = 'verif-hash';

/** Largest accepted webhook body; Flutterwave events are a few kilobytes. */
export const MAX_WEBHOOK_BYTES = 64 * 1024;

/**
 * Constant-time comparison of the header with the secret hash. Both are
 * hashed first, so the comparison time does not depend on their lengths.
 */
export function verifyWebhookSignature(header: string | null, secretHash: string): boolean {
  if (!header || !secretHash) {
    return false;
  }

  const received = createHash('sha256').update(header).digest();
  const expected = createHash('sha256').update(secretHash).digest();
  return timingSafeEqual(received, expected);
}

const eventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
});

const chargeSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.string().min(1).max(50),
});

const subscriptionCancelledSchema = z.object({
  customer: z.object({ email: z.string().min(3).max(320) }),
  plan: z.object({ id: z.coerce.number().int().positive() }),
});

export type WebhookEvent =
  | { readonly type: 'charge.completed'; readonly transactionId: number; readonly status: string }
  | { readonly type: 'subscription.cancelled'; readonly email: string; readonly planId: number }
  | { readonly type: 'other'; readonly name: string };

export type ParsedWebhook = {
  readonly event: WebhookEvent;
  /** Idempotency key, unique per provider (DATABASE-SCHEMA §15). */
  readonly eventId: string;
  readonly eventType: string;
  readonly payloadHash: string;
};

/**
 * Validates the payload structure. Returns null for malformed payloads.
 * Only the transaction ID and status of a charge are used; amounts and
 * statuses that matter are read again from Flutterwave's API.
 */
export function parseWebhook(rawBody: string): ParsedWebhook | null {
  let json: unknown;

  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const parsed = eventSchema.safeParse(json);

  if (!parsed.success) {
    return null;
  }

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const { event: name, data } = parsed.data;

  if (name === 'charge.completed') {
    const charge = chargeSchema.safeParse(data);

    if (!charge.success) {
      return null;
    }

    // One key per transaction and status (Flutterwave's idempotency advice),
    // so a later status change of the same charge is still processed.
    const status = charge.data.status.toLowerCase();
    return {
      event: { type: name, transactionId: charge.data.id, status },
      eventId: `${name}:${charge.data.id}:${status}`,
      eventType: name,
      payloadHash,
    };
  }

  if (name === 'subscription.cancelled') {
    const cancelled = subscriptionCancelledSchema.safeParse(data);

    if (!cancelled.success) {
      return null;
    }

    return {
      event: { type: name, email: cancelled.data.customer.email, planId: cancelled.data.plan.id },
      eventId: `${name}:${payloadHash}`,
      eventType: name,
      payloadHash,
    };
  }

  return {
    event: { type: 'other', name },
    eventId: `${name}:${payloadHash}`,
    eventType: name,
    payloadHash,
  };
}
