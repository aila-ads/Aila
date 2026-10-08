import type { Metadata } from 'next';
import { PageError } from '../../../components/account/page-error';
import { DashboardView } from '../../../components/dashboard/dashboard-view';
import { loadPageData } from '../../../server/api/caller';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dashboard · Aila' };

export default async function DashboardPage() {
  const result = await loadPageData('/dashboard', async (api) => {
    const [overview, trial, entitlements] = await Promise.all([
      api.account.me(),
      api.account.trial(),
      api.account.entitlements(),
    ]);
    return { overview, trial, entitlements };
  });

  if ('error' in result) {
    return <PageError title="Welcome to Aila" message={result.error} retryHref="/dashboard" />;
  }

  const { overview, trial, entitlements } = result.data;

  return (
    <DashboardView
      name={overview.user.displayName || overview.user.email}
      trial={trial}
      entitlements={entitlements}
    />
  );
}
