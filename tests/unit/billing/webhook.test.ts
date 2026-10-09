import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWebhook, verifyWebhookSignature } from '../../../packages/billing/src/webhook';
import {
  getFlutterwaveSecretKey,
  getProPlanId,
  getWebhookSecretHash,
} from '../../../packages/billing/src/env';

const SECRET = 'f'.repeat(64);

describe('verifyWebhookSignature', () => {
  it('accepts only the exact secret hash', () => {
    expect(verifyWebhookSignature(SECRET, SECRET)).toBe(true);
    expect(verifyWebhookSignature(`${SECRET.slice(0, -1)}e`, SECRET)).toBe(false);
    expect(verifyWebhookSignature(`${SECRET}f`, SECRET)).toBe(false);
    expect(verifyWebhookSignature('short', SECRET)).toBe(false);
  });

  it('rejects a missing header or an empty secret', () => {
    expect(verifyWebhookSignature(null, SECRET)).toBe(false);
    expect(verifyWebhookSignature('', SECRET)).toBe(false);
    expect(verifyWebhookSignature(SECRET, '')).toBe(false);
  });
});

describe('parseWebhook', () => {
  it('keys a charge by transaction ID and status', () => {
    const parsed = parseWebhook(
      JSON.stringify({ event: 'charge.completed', data: { id: 285959875, status: 'successful', amount: 1 } }),
    );
    expect(parsed?.event).toEqual({ type: 'charge.completed', transactionId: 285959875, status: 'successful' });
    expect(parsed?.eventId).toBe('charge.completed:285959875:successful');
  });

  it('gives the same key to a duplicate delivery and a new key to a status change', () => {
    const body = (status: string) =>
      JSON.stringify({ event: 'charge.completed', data: { id: 5, status } });
    expect(parseWebhook(body('successful'))?.eventId).toBe(parseWebhook(body('successful'))?.eventId);
    expect(parseWebhook(body('failed'))?.eventId).not.toBe(parseWebhook(body('successful'))?.eventId);
  });

  it('parses subscription.cancelled', () => {
    const parsed = parseWebhook(
      JSON.stringify({
        event: 'subscription.cancelled',
        data: { status: 'deactivated', customer: { email: 'a@example.com' }, plan: { id: 10944 } },
      }),
    );
    expect(parsed?.event).toEqual({ type: 'subscription.cancelled', email: 'a@example.com', planId: 10944 });
  });

  it('rejects malformed payloads', () => {
    expect(parseWebhook('not json')).toBeNull();
    expect(parseWebhook(JSON.stringify({ data: {} }))).toBeNull();
    expect(parseWebhook(JSON.stringify({ event: 'charge.completed', data: { status: 'successful' } }))).toBeNull();
    expect(parseWebhook(JSON.stringify({ event: 'charge.completed', data: { id: -1, status: 'x' } }))).toBeNull();
    expect(parseWebhook(JSON.stringify({ event: 'subscription.cancelled', data: { plan: {} } }))).toBeNull();
  });
});

describe('Flutterwave configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses test keys and missing values', () => {
    vi.stubEnv('FLUTTERWAVE_SECRET_KEY', 'FLWSECK_TEST-abc-X');
    expect(() => getFlutterwaveSecretKey()).toThrow('live secret key');
    vi.stubEnv('FLUTTERWAVE_SECRET_KEY', '');
    expect(() => getFlutterwaveSecretKey()).toThrow('is required');
    vi.stubEnv('FLUTTERWAVE_SECRET_KEY', 'FLWSECK-abc-X');
    expect(getFlutterwaveSecretKey()).toBe('FLWSECK-abc-X');
  });

  it('requires a strong webhook hash and a numeric plan ID', () => {
    vi.stubEnv('FLUTTERWAVE_WEBHOOK_SECRET_HASH', 'short');
    expect(() => getWebhookSecretHash()).toThrow('at least 32');
    vi.stubEnv('FLUTTERWAVE_PRO_PLAN_ID', 'plan-1');
    expect(() => getProPlanId()).toThrow('payment plan ID');
    vi.stubEnv('FLUTTERWAVE_PRO_PLAN_ID', '12345');
    expect(getProPlanId()).toBe(12345);
  });
});
