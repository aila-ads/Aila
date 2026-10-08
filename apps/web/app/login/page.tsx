import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@aila/auth/server';
import { LoginForm } from './login-form';
import { Crest } from '../../components/brand/crest';
import { OrnamentRule } from '../../components/brand/ornament-rule';
import { Wordmark } from '../../components/brand/wordmark';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser().catch(() => null)) {
    redirect('/dashboard');
  }

  return (
    <main className="auth-page">
      <div className="brand-lockup">
        <Crest className="size-16" />
        <Wordmark className="text-3xl" />
      </div>
      <OrnamentRule className="mb-2" />
      <h1>Sign in to Aila</h1>
      <p>Use your Aila account to continue.</p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
