import { handleFlutterwaveWebhook } from '@aila/billing';

export const dynamic = 'force-dynamic';

/**
 * Flutterwave billing webhook (APPLICATION-ARCHITECTURE §12). Public by
 * necessity: it is authenticated by the `verif-hash` header, not a session
 * or the browser CSRF check (SECURITY-ARCHITECTURE §9.4).
 */
export function POST(request: Request): Promise<Response> {
  return handleFlutterwaveWebhook(request);
}
