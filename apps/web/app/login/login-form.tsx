'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AUTH_MESSAGES } from '@aila/auth';
import { signInWithEmail, type AuthFormState } from '@aila/auth/actions';
import { GoogleSignIn } from '../../components/auth/google-sign-in';
import { VerifyEmailForm } from '../../components/auth/verify-email-form';
import { safeRedirectPath } from '../../lib/safe-redirect';

const initialState: AuthFormState = { status: 'idle' };

// Fixed messages only; query values are never echoed.
const QUERY_ERRORS: Record<string, string> = {
  google: AUTH_MESSAGES.googleFailed,
  account: AUTH_MESSAGES.accountUnavailable,
  restricted: AUTH_MESSAGES.accountRestricted,
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only same-site paths are honoured; anything else falls back to /dashboard.
  const redirectTo = safeRedirectPath(searchParams.get('redirect'));
  const afterReset = searchParams.get('reset') === '1';
  const queryError = QUERY_ERRORS[searchParams.get('error') ?? ''] ?? null;

  const [state, formAction, pending] = useActionState(signInWithEmail, initialState);

  useEffect(() => {
    if (state.status === 'signed_in') {
      router.replace(redirectTo);
      router.refresh();
    }
  }, [state.status, redirectTo, router]);

  if (state.status === 'verify') {
    return (
      <VerifyEmailForm
        email={state.email}
        message={state.message}
        redirectTo={redirectTo}
      />
    );
  }

  const error = state.status === 'error' ? state.message : queryError;

  return (
    <div>
      {afterReset ? <p role="status">{AUTH_MESSAGES.resetDone}</p> : null}

      <form action={formAction}>
        {afterReset ? <input type="hidden" name="afterReset" value="1" /> : null}

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </div>

        {error ? <p role="alert">{error}</p> : null}

        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>

        <p>
          <Link href="/forgot-password">Forgot password?</Link>
        </p>
      </form>

      <GoogleSignIn redirectTo={redirectTo} />

      <p>
        No account? <Link href="/signup">Create one</Link>
      </p>
    </div>
  );
}
