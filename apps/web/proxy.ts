import { NextRequest, NextResponse } from 'next/server';
import { protectRequest } from '@aila/auth/proxy';
import { contentSecurityPolicy } from './lib/csp';
import { isPublicPath } from './lib/public-paths';

/**
 * Deny by default (SECURITY-ARCHITECTURE §2.3): every path that is not
 * allowed by isPublicPath requires a valid Neon Auth session. Pages and
 * handlers also check the session on the server; this proxy is not the
 * only check.
 */
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

  if (isPublicPath(pathname)) {
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
