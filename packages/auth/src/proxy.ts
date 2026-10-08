import type { NextRequest } from 'next/server';
import { getAuth } from './server';

/**
 * Runs Neon Auth's route protection for a request: completes the OAuth
 * session exchange, refreshes the session, and redirects unauthenticated
 * requests to the sign-in page with a same-site `redirect` path.
 */
export function protectRequest(request: NextRequest, loginPath: string) {
  const { pathname, search } = request.nextUrl;
  const loginUrl = new URL(loginPath, request.nextUrl.origin);

  if (pathname !== '/') {
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  }

  return getAuth().middleware({
    loginUrl: `${loginUrl.pathname}${loginUrl.search}`,
  })(request);
}
