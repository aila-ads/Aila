import { redirect } from 'next/navigation';
import { getSessionUser } from '@aila/auth/server';
import { SignupForm } from './signup-form';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await getSessionUser().catch(() => null)) {
    redirect('/dashboard');
  }

  return (
    <main>
      <h1>Create your Aila account</h1>
      <p>Your account starts with a 3-hour Aila trial.</p>
      <SignupForm />
    </main>
  );
}
