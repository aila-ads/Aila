'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpWithEmail, type AuthFormState } from '@aila/auth/actions';
import { GoogleSignIn } from '../../components/auth/google-sign-in';
import { VerifyEmailForm } from '../../components/auth/verify-email-form';

const initialState: AuthFormState = { status: 'idle' };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpWithEmail, initialState);

  if (state.status === 'verify') {
    return <VerifyEmailForm email={state.email} message={state.message} />;
  }

  return (
    <div>
      <form action={formAction}>
        <div>
          <label htmlFor="name">Name (optional)</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={100}
          />
        </div>

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
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </div>

        <div>
          <label htmlFor="confirmation">Confirm password</label>
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
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <GoogleSignIn redirectTo="/dashboard" />

      <p>
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
