import type { BillingPrice, BillingSummary, CheckoutMethod } from '@aila/billing';
import type { TrialSummary } from '@aila/auth/server';
import { TrialStatus } from '../account/trial-status';
import { OrnamentRule } from '../brand/ornament-rule';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { CancelSubscription, PaymentOptions, type PaymentChoice } from './billing-actions';

export type CheckoutNotice = 'ACTIVE' | 'PENDING' | 'FAILED' | 'CANCELLED';

const NOTICE_TEXT: Record<CheckoutNotice, string> = {
  ACTIVE: 'Payment confirmed. Welcome to Aila Pro.',
  PENDING:
    'Your payment is still being confirmed. Aila Pro is activated automatically as soon as the payment provider confirms it.',
  FAILED: 'The payment did not go through, and nothing was added. You can try again.',
  CANCELLED: 'The payment was not completed, and you were not charged.',
};

const STATE_BADGE: Record<NonNullable<BillingSummary['subscription']>['state'], string> = {
  ACTIVE: 'Active',
  CANCELLING: 'Cancelled',
  RENEWAL_DUE: 'Renewal due',
  PAST_DUE: 'Payment failed',
  ENDED: 'Ended',
};

const METHOD_TEXT: Record<CheckoutMethod, { name: string; methods: string; note: string }> = {
  FLUTTERWAVE: {
    name: 'Flutterwave',
    methods: 'Card, bank transfer, USSD, bank account, NQR, Barter, Opay, Apple Pay and Google Pay.',
    note: 'for one month',
  },
  PAYSTACK: {
    name: 'Paystack',
    methods: 'Card, bank, bank transfer, USSD, QR, mobile money and Apple Pay.',
    note: 'for one month',
  },
  PAYPAL: {
    name: 'PayPal',
    methods: 'PayPal balance, or a debit or credit card through PayPal.',
    note: 'for one month',
  },
  FLUTTERWAVE_CARD_PLAN: {
    name: 'Monthly card subscription',
    methods: 'Charged to your card by Flutterwave every month until you cancel.',
    note: 'per month',
  },
};

/** Aila Pro plan, status and actions (AILA-V1-SCOPE §23, AC-160, AC-163). */
export function BillingView({
  billing,
  trial,
  locale,
  timeZone,
  notice,
}: {
  billing: BillingSummary;
  trial: TrialSummary;
  locale: string;
  timeZone: string;
  notice: CheckoutNotice | null;
}) {
  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(
          new Date(iso),
        )
      : null;
  const formatPrice = (price: BillingPrice) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(
      Number(price.amount),
    );

  const subscription = billing.subscription;
  const planState = subscription?.state ?? 'ENDED';
  const renewing = planState === 'ACTIVE' || planState === 'RENEWAL_DUE' || planState === 'PAST_DUE';
  const prepaidUntil = formatDate(billing.prepaidUntil);
  const periodEnd = formatDate(subscription?.currentPeriodEnd ?? null);
  const charge = subscription?.lastCharge ?? null;
  const hasAccess = renewing || prepaidUntil !== null;

  let status: string;
  let badge: string | null = subscription ? STATE_BADGE[planState] : null;

  if (renewing) {
    switch (planState) {
      case 'ACTIVE':
        status = `Aila Pro is active. Your card subscription renews on ${periodEnd}${charge ? ` for ${formatPrice(charge)}` : ''}.`;
        break;
      case 'RENEWAL_DUE':
        status =
          'Your renewal payment is being processed. Pro features return as soon as Flutterwave confirms it.';
        break;
      default:
        status =
          'Your renewal payment failed. Flutterwave will try the charge again; Pro features return when it succeeds.';
    }
  } else if (prepaidUntil) {
    badge = 'Active';
    status = `Aila Pro is active until ${prepaidUntil}. It does not renew automatically; add another month any time and it starts when your current access ends.`;
  } else {
    badge = subscription ? 'Ended' : null;
    status = subscription
      ? 'Your Aila Pro access has ended. Your account and data stay available.'
      : 'You do not have Aila Pro yet.';
  }

  const choices: PaymentChoice[] = billing.options.map((option) => ({
    method: option.method,
    ...METHOD_TEXT[option.method],
    price: formatPrice(option.price),
  }));
  const oneMonth = choices.filter((choice) => choice.method !== 'FLUTTERWAVE_CARD_PLAN');
  const cardPlan = choices.filter((choice) => choice.method === 'FLUTTERWAVE_CARD_PLAN');

  return (
    <div className="grid gap-6">
      <div className="grid gap-5">
        <h1 className="text-3xl font-medium tracking-[0.02em] sm:text-4xl">Billing</h1>
        <OrnamentRule />
      </div>

      {notice ? (
        <Card role="status">
          <CardHeader>
            <CardDescription>{NOTICE_TEXT[notice]}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card aria-labelledby="pro-heading" role="region">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle id="pro-heading">Aila Pro</CardTitle>
            {badge ? <Badge variant={hasAccess && badge === 'Active' ? 'default' : 'outline'}>{badge}</Badge> : null}
          </div>
          <CardDescription>
            One subscription for Intelligence, Writer, Translate, Ads, Legal and Coding, with
            advanced models and higher limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <p className="text-sm">{status}</p>

          {!hasAccess ? (
            <div className="grid gap-2 text-sm text-muted-foreground">
              <TrialStatus trial={trial} />
            </div>
          ) : null}

          {billing.canBuy && oneMonth.length > 0 ? (
            <section aria-labelledby="buy-heading" className="grid gap-4">
              <div className="grid gap-1">
                <h2 id="buy-heading" className="font-serif text-xl tracking-[0.02em]">
                  {hasAccess ? 'Add a month' : 'Choose how to pay'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  One month of Aila Pro per payment. Nothing is charged again unless you pay again.
                </p>
              </div>
              <PaymentOptions choices={oneMonth} />
            </section>
          ) : null}

          {billing.canBuy && cardPlan.length > 0 ? (
            <section aria-labelledby="plan-heading" className="grid gap-3">
              <h2 id="plan-heading" className="font-serif text-lg tracking-[0.02em]">
                Or renew automatically
              </h2>
              <PaymentOptions choices={cardPlan} />
            </section>
          ) : null}

          {billing.buyRefusal === 'PREPAID_LIMIT' ? (
            <p className="text-sm text-muted-foreground">
              Aila Pro is already paid for about a year ahead. You can add more time later.
            </p>
          ) : null}

          {billing.isOwner && billing.buyRefusal === null && !billing.canBuy ? (
            <p role="alert" className="text-sm text-destructive">
              {billing.optionsUnavailable
                ? 'Payments are unavailable right now. Please try again later.'
                : 'Payments are not available yet.'}
            </p>
          ) : null}

          {billing.canCancel ? (
            <CancelSubscription accessUntil={planState === 'ACTIVE' ? periodEnd : null} />
          ) : null}

          {!billing.isOwner ? (
            <p className="text-sm text-muted-foreground">Only the account owner can manage billing.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
