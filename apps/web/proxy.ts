import { NextRequest, NextResponse } from 'next/server';
import { protectRequest } from '@aila/auth/proxy';
import { contentSecurityPolicy } from './lib/csp';

/**
 * Deny by default (SECURITY-ARCHITECTURE §2.3): every path that is not
 * listed here requires a valid Neon Auth session. Pages and handlers also
 * check the session on the server; this proxy is not the only check.
 */
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const csp = contentSecurityPolicy({
    nonce: btoa(crypto.randomUUID()),
    storageEndpoint: process.env.STORAGE_ENDPOINT,
    development: process.env.NODE_ENV === 'development',
  });

  // Next.js reads the nonce from the request's CSP header and puts it on
  // the scripts it renders; the browser enforces the response header.
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);

  let response: NextResponse;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/api/auth/') ||
    // The API checks the session itself and answers with JSON errors
    // instead of redirects.
    pathname.startsWith('/api/trpc/') ||
    // Aila Intelligence streaming: the handler checks the session itself.
    pathname === '/api/intelligence/messages' ||
    // Aila Intelligence voice input: the handler checks the session itself.
    pathname === '/api/intelligence/transcribe' ||
    // Flutterwave calls this without a session; the handler checks the
    // webhook's secret hash instead.
    pathname === '/api/webhooks/flutterwave' ||
    pathname.startsWith('/_next/')
  ) {
    response = NextResponse.next({ request: { headers } });
  } else {
    // Includes /auth/callback, where Neon Auth completes the Google sign-in.
    // Neon Auth reads only the URL, headers and cookies, and forwards these
    // headers (with the CSP) to the page. The body is never read here.
    response = await protectRequest(
      new NextRequest(request.url, { method: request.method, headers }),
      '/login',
    );
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
