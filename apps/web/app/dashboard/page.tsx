import Link from 'next/link';
import { SignOutButton } from '../../components/account/sign-out-button';
import { TrialStatus } from '../../components/account/trial-status';
import { loadPageData } from '../../server/api/caller';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const result = await loadPageData('/dashboard', async (api) => {
    const [overview, trial] = await Promise.all([api.account.me(), api.account.trial()]);
    return { overview, trial };
  });

  if ('error' in result) {
    return (
      <main>
        <h1>Welcome to Aila</h1>
        <p role="alert">{result.error}</p>
        <SignOutButton />
      </main>
    );
  }

  const { overview, trial } = result.data;
  const { user } = overview;

  return (
    <main>
      <h1>Welcome to Aila</h1>
      <p>{user.displayName || user.email}</p>
      <p>Your Aila account is ready.</p>
      <TrialStatus trial={trial} />
      <nav aria-label="Account">
        <Link href="/settings">Account settings</Link>
      </nav>
      <SignOutButton />
    </main>
  );
}
