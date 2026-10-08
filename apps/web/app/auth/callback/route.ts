import { NextResponse } from 'next/server';
import {
  AuthIdentityError,
  ensureAilaIdentity,
  getAuth,
  getSessionUser,
  recordAuthEvent,
} from '@aila/auth/server';
import { safeRedirectPath } from '../../../lib/safe-redirect';

export const dynamic = 'force-dynamic';

/**
 * Landing route after Google sign-in. Neon Auth's proxy middleware has
 * already exchanged the one-time verifier for session cookies; this route
 * links or provisions the Aila identity, audits the sign-in and continues.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectTo = safeRedirectPath(requestUrl.searchParams.get('redirect'));
  const failure = new URL('/login?error=google', requestUrl.origin);

  let authUser;

  try {
    authUser = await getSessionUser();
  } catch {
    return NextResponse.redirect(failure);
  }

  if (!authUser) {
    return NextResponse.redirect(failure);
  }

  try {
    const identity = await ensureAilaIdentity(authUser);

    await recordAuthEvent({
      action: 'LOGIN',
      method: 'google',
      accountId: identity.accountId,
      userId: identity.id,
    });
  } catch (error) {
    await getAuth().signOut();

    if (error instanceof AuthIdentityError && error.code === 'EMAIL_NOT_VERIFIED') {
      return NextResponse.redirect(new URL('/verify-email', requestUrl.origin));
    }

    console.error('[auth] Could not resolve Aila identity after Google sign-in', {
      error: error instanceof AuthIdentityError ? error.code : 'UNEXPECTED',
    });
    return NextResponse.redirect(new URL('/login?error=account', requestUrl.origin));
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
