/**
 * Pages anyone can open without signing in (SECURITY-ARCHITECTURE §2.3:
 * deny by default). Everything else goes through the Neon Auth check in
 * proxy.ts. Kept free of imports so it can be unit tested on its own.
 */
export const PUBLIC_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  // Legal pages must be readable before an account exists.
  '/privacy',
  '/terms',
]);

/**
 * API routes that authenticate the caller themselves: Neon Auth, the tRPC
 * API and the Aila Intelligence and Writer handlers check the session and
 * answer with JSON errors instead of redirects; the payment webhooks verify
 * the provider's signature instead of a session.
 */
const SELF_AUTHENTICATING_ROUTES: ReadonlySet<string> = new Set([
  '/api/intelligence/messages',
  '/api/intelligence/transcribe',
  '/api/writer/assist',
  '/api/webhooks/flutterwave',
  '/api/webhooks/paystack',
  '/api/webhooks/paypal',
]);

/** True when proxy.ts should let the request through without a session. */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PAGES.has(pathname) ||
    SELF_AUTHENTICATING_ROUTES.has(pathname) ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/trpc/') ||
    pathname.startsWith('/_next/')
  );
}
