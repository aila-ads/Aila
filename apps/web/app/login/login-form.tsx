'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthBrowserClient } from '@aila/auth';
import { Button } from '@aila/ui/components/button';
import { Input } from '@aila/ui/components/input';
import { Label } from '@aila/ui/components/label';
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
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link
          href="/signup"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
