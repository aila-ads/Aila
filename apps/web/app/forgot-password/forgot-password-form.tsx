'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type AuthFormState } from '@aila/auth/actions';

const initialState: AuthFormState = { status: 'idle' };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.status === 'sent') {
    return (
      <p role="status">
        {state.message} <Link href="/login">Back to sign in</Link>
      </p>
    );
  }

  return (
    <form action={formAction}>
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

      {state.status === 'error' ? <p role="alert">{state.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </button>

      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}
