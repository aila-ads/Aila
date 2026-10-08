import Link from 'next/link';
import { SignOutButton } from '../../components/account/sign-out-button';
import { loadPageData } from '../../server/api/caller';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const result = await loadPageData('/dashboard', (api) => api.account.me());

  if ('error' in result) {
    return (
      <main>
        <h1>Welcome to Aila</h1>
        <p role="alert">{result.error}</p>
        <SignOutButton />
      </main>
    );
  }

  const { user } = result.data;

  return (
    <main>
      <h1>Welcome to Aila</h1>
      <p>{user.displayName || user.email}</p>
      <p>Your Aila account is ready.</p>
      <nav aria-label="Account">
        <Link href="/settings">Account settings</Link>
      </nav>
      <SignOutButton />
    </main>
  );
}
