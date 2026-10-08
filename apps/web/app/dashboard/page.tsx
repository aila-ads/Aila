import Link from 'next/link';
import { PRODUCT_ENTITLEMENT_KEYS, type EntitlementKey } from '@aila/auth/server';
import { SignOutButton } from '../../components/account/sign-out-button';
import { TrialStatus } from '../../components/account/trial-status';
import { loadPageData } from '../../server/api/caller';

export const dynamic = 'force-dynamic';

const PRODUCT_NAMES: Partial<Record<EntitlementKey, string>> = {
  intelligence: 'Aila Intelligence',
  writer: 'Aila Writer',
  translate: 'Aila Translate',
  ads: 'Aila Ads',
  legal: 'Aila Legal',
  coding: 'Aila Coding',
};

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
    return (
      <main>
        <h1>Welcome to Aila</h1>
        <p role="alert">{result.error}</p>
        <SignOutButton />
      </main>
    );
  }

  const { overview, trial, entitlements } = result.data;
  const { user } = overview;

  return (
    <main>
      <h1>Welcome to Aila</h1>
      <p>{user.displayName || user.email}</p>
      <p>Your Aila account is ready.</p>
      <TrialStatus trial={trial} granted={entitlements.source === 'GRANT'} />
      <section aria-labelledby="products-heading">
        <h2 id="products-heading">Products</h2>
        <ul>
          {PRODUCT_ENTITLEMENT_KEYS.map((key) => (
            <li key={key}>
              {PRODUCT_NAMES[key]}:{' '}
              {entitlements.keys.includes(key) ? 'Available' : 'Requires Aila Pro'}
            </li>
          ))}
        </ul>
      </section>
      <nav aria-label="Account">
        <Link href="/settings">Account settings</Link>
      </nav>
      <SignOutButton />
    </main>
  );
}
