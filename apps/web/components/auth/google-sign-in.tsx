'use client';

import { useState } from 'react';
import { AUTH_MESSAGES, createAuthBrowserClient } from '@aila/auth';

/** Starts Google sign-in through Neon Auth (AILA-V1-ARCHITECTURE §13). */
export function GoogleSignIn({ redirectTo }: { redirectTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setError(null);
    setPending(true);

    const origin = window.location.origin;
    const callback = new URL('/auth/callback', origin);
    callback.searchParams.set('redirect', redirectTo);

    const { error: signInError } = await createAuthBrowserClient().signIn.social({
      provider: 'google',
      callbackURL: callback.toString(),
      errorCallbackURL: new URL('/login?error=google', origin).toString(),
    });

    if (signInError) {
      setError(
        signInError.status === 429
          ? AUTH_MESSAGES.rateLimited
          : AUTH_MESSAGES.googleFailed,
      );
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={pending}>
        {pending ? 'Opening Google…' : 'Continue with Google'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
