import type { Metadata } from 'next';
import type { ConfirmCheckoutInput } from '@aila/validation';
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
  cancelled: 'CANCELLED',
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The provider return the URL describes: Flutterwave adds `transaction_id`,
 * Paystack `reference`, PayPal `token` (the order ID). Abandoned checkouts
 * come back with `checkout=cancelled` and are not confirmed.
 */
function checkoutReturn(params: Record<string, string | string[] | undefined>): ConfirmCheckoutInput | null {
  if (first(params.checkout) === 'cancelled' || first(params.status) === 'cancelled') {
    return null;
  }

  const transactionId = first(params.transaction_id);

  if (transactionId && /^[1-9][0-9]{0,15}$/.test(transactionId)) {
    return { provider: 'FLUTTERWAVE', transactionId };
  }

  const reference = first(params.reference);

  if (reference && /^aila-[0-9a-f-]{36}$/.test(reference)) {
    return { provider: 'PAYSTACK', reference };
  }

  const orderId = first(params.token);

  if (orderId && /^[A-Z0-9]{1,36}$/.test(orderId)) {
    return { provider: 'PAYPAL', orderId };
  }

  return null;
}

/**
 * Aila Pro billing (PRODUCT-SPEC §8, §22; AILA-V1-SCOPE §23). The payment
 * provider returns the customer here; the page only passes the reference
 * to the server, which verifies the payment with the provider.
 */
export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returned = checkoutReturn(params);

  if (returned) {
    return <CheckoutReturn input={returned} />;
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
