import { handlePaystackWebhook } from '@aila/billing';

export const dynamic = 'force-dynamic';

/**
 * Paystack billing webhook. Public by necessity: it is authenticated by the
 * HMAC-SHA512 `x-paystack-signature` header, not a session or the browser
 * CSRF check (SECURITY-ARCHITECTURE §9.4).
 */
export function POST(request: Request): Promise<Response> {
  return handlePaystackWebhook(request);
}
