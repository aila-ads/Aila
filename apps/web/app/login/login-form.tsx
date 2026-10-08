'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthBrowserClient } from '@aila/auth';
import { safeRedirectPath } from '../../lib/safe-redirect';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only same-site paths are honoured; anything else falls back to /dashboard.
  const redirectTo = safeRedirectPath(searchParams.get('redirect'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createAuthBrowserClient();

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error ? <p role="alert">{error}</p> : null}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      <p>
        No account? <Link href="/signup">Create one</Link>
      </p>
    </form>
  );
}
