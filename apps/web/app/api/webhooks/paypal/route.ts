import { handlePaypalWebhook } from '@aila/billing';

export const dynamic = 'force-dynamic';

/**
 * PayPal billing webhook. Public by necessity: each event is verified with
 * PayPal's verify-webhook-signature API against PAYPAL_WEBHOOK_ID, not a
 * session or the browser CSRF check (SECURITY-ARCHITECTURE §9.4).
 */
export function POST(request: Request): Promise<Response> {
  return handlePaypalWebhook(request);
}
