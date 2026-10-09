import type { Metadata } from 'next';
import { PageError } from '../../../components/account/page-error';
import { BillingView, type CheckoutNotice } from '../../../components/billing/billing-view';
import { CheckoutReturn } from '../../../components/billing/checkout-return';
import { loadPageData } from '../../../server/api/caller';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Billing · Aila' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, CheckoutNotice> = {
  active: 'ACTIVE',
  pending: 'PENDING',
  failed: 'FAILED',
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Aila Pro billing (PRODUCT-SPEC §8, §22; AILA-V1-SCOPE §23). Flutterwave
 * returns the customer here with `transaction_id`; the page only passes it
 * to the server, which verifies the payment with Flutterwave.
 */
export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const transactionId = first(params.transaction_id);

  if (transactionId && /^[1-9][0-9]{0,15}$/.test(transactionId)) {
    return <CheckoutReturn transactionId={transactionId} />;
  }

  const result = await loadPageData('/billing', async (api) => {
    const [overview, trial, billing] = await Promise.all([
      api.account.me(),
      api.account.trial(),
      api.billing.summary(),
    ]);
    return { overview, trial, billing };
  });

  if ('error' in result) {
    return <PageError title="Billing" message={result.error} retryHref="/billing" />;
  }

  const { overview, trial, billing } = result.data;
  const notice: CheckoutNotice | null =
    NOTICES[first(params.checkout) ?? ''] ?? (first(params.status) === 'cancelled' ? 'CANCELLED' : null);

  return (
    <BillingView
      billing={billing}
      trial={trial}
      locale={overview.settings.locale}
      timeZone={overview.settings.timezone}
      notice={notice}
    />
  );
}
