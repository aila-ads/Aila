import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@aila/auth/server';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser().catch(() => null)) {
    redirect('/dashboard');
  }

  return (
    <main>
      <h1>Sign in to Aila</h1>
      <p>Use your Aila account to continue.</p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
