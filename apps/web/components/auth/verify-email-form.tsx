'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  resendVerificationCode,
  verifyEmailCode,
  type AuthFormState,
} from '@aila/auth/actions';

const initialState: AuthFormState = { status: 'idle' };

/** Email verification with the 6-digit code Neon Auth sends. */
export function VerifyEmailForm({
  email = '',
  message,
  redirectTo = '/dashboard',
}: {
  email?: string;
  message?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyEmailCode,
    initialState,
  );
  const [resendState, resendAction, resending] = useActionState(
    resendVerificationCode,
    initialState,
  );

  useEffect(() => {
    if (verifyState.status === 'signed_in') {
      router.replace(redirectTo);
      router.refresh();
    }
  }, [verifyState.status, redirectTo, router]);

  if (verifyState.status === 'verified') {
    return (
      <p role="status">
        Your email is verified. <Link href="/login">Sign in</Link> to continue.
      </p>
    );
  }

  const notice =
    resendState.status === 'verify' ? resendState.message : message ?? null;
  const error =
    verifyState.status === 'error'
      ? verifyState.message
      : resendState.status === 'error'
        ? resendState.message
        : null;

  return (
    <div>
      {notice ? <p role="status">{notice}</p> : null}

      <form action={verifyAction}>
        <div>
          <label htmlFor="verify-email">Email</label>
          <input
            id="verify-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email}
          />
        </div>

        <div>
          <label htmlFor="verify-otp">Verification code</label>
          <input
            id="verify-otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </div>

        {error ? <p role="alert">{error}</p> : null}

        <button type="submit" disabled={verifying}>
          {verifying ? 'Verifying…' : 'Verify email'}
        </button>

        <button
          type="submit"
          formAction={resendAction}
          formNoValidate
          disabled={resending}
        >
          {resending ? 'Sending…' : 'Send a new code'}
        </button>
      </form>
    </div>
  );
}
