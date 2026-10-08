'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createAuthBrowserClient } from '@aila/auth';
import { Button } from '@aila/ui/components/button';
import { Input } from '@aila/ui/components/input';
import { Label } from '@aila/ui/components/label';

export function SignupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    const supabase = createAuthBrowserClient();
    const fullName = name.trim();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Optional display name; used when the Aila account is provisioned.
        ...(fullName ? { data: { full_name: fullName } } : {}),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    if (data.session) {
      window.location.assign('/dashboard');
      return;
    }

    setMessage(
      'Check your email to confirm your account, then return to Aila.',
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name (optional)</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

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
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmation">Confirm password</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
