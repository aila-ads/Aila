import { NextResponse, type NextRequest } from 'next/server';
import { protectRequest } from '@aila/auth/proxy';

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

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next();
  }

  // Includes /auth/callback, where Neon Auth completes the Google sign-in.
  return protectRequest(request, '/login');
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
