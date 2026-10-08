import { redirect } from 'next/navigation';
import { AuthIdentityError, getAilaIdentity } from '@aila/auth/server';
import { AUTH_MESSAGES } from '@aila/auth';
import { signOut } from '@aila/auth/actions';

export const dynamic = 'force-dynamic';

function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit">Sign out</button>
    </form>
  );
}

export default async function DashboardPage() {
  let identity;

  try {
    identity = await getAilaIdentity();
  } catch (error) {
    if (error instanceof AuthIdentityError && error.code === 'EMAIL_NOT_VERIFIED') {
      redirect('/verify-email');
    }

    return (
      <main>
        <h1>Welcome to Aila</h1>
        <p role="alert">{AUTH_MESSAGES.accountUnavailable}</p>
        <SignOutButton />
      </main>
    );
  }

  if (!identity) {
    redirect('/login?redirect=/dashboard');
  }

  return (
    <main>
      <h1>Welcome to Aila</h1>
      <p>{identity.name || identity.email}</p>
      <p>Your Aila account is ready.</p>
      <SignOutButton />
    </main>
  );
}
