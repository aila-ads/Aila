'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AUTH_MESSAGES } from '@aila/auth';
import { resetPassword, type AuthFormState } from '@aila/auth/actions';

const initialState: AuthFormState = { status: 'idle' };

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  useEffect(() => {
    if (state.status === 'reset_done') {
      router.replace('/login?reset=1');
    }
  }, [state.status, router]);

  if (!token || searchParams.get('error')) {
    return (
      <p role="alert">
        {AUTH_MESSAGES.resetInvalid}{' '}
        <Link href="/forgot-password">Request a new link</Link>
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </div>

      <div>
        <label htmlFor="confirmation">Confirm new password</label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </div>

      {state.status === 'error' ? <p role="alert">{state.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}
