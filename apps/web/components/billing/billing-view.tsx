import type { BillingPrice, BillingSummary } from '@aila/billing';
import type { TrialSummary } from '@aila/auth/server';
import { TrialStatus } from '../account/trial-status';
import { OrnamentRule } from '../brand/ornament-rule';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { CancelSubscription, SubscribeButton } from './billing-actions';

export type CheckoutNotice = 'ACTIVE' | 'PENDING' | 'FAILED' | 'CANCELLED';

const NOTICE_TEXT: Record<CheckoutNotice, string> = {
  ACTIVE: 'Payment confirmed. Welcome to Aila Pro.',
  PENDING:
    'Your payment is still being confirmed. Aila Pro is activated automatically as soon as Flutterwave confirms it.',
  FAILED: 'The payment did not go through, and you were not subscribed. You can try again.',
  CANCELLED: 'The payment was not completed, and you were not charged.',
};

const STATE_BADGE: Record<NonNullable<BillingSummary['subscription']>['state'], string> = {
  ACTIVE: 'Active',
  CANCELLING: 'Cancelled',
  RENEWAL_DUE: 'Renewal due',
  PAST_DUE: 'Payment failed',
  ENDED: 'Ended',
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
  const state = subscription?.state ?? 'ENDED';
  const periodEnd = formatDate(subscription?.currentPeriodEnd ?? null);
  const charge = subscription?.lastCharge ?? null;

  let status: string;

  switch (state) {
    case 'ACTIVE':
      status = `Aila Pro is active. It renews on ${periodEnd}${charge ? ` for ${formatPrice(charge)}` : ''}.`;
      break;
    case 'CANCELLING':
      status = `Aila Pro is cancelled and will not renew. You keep access until ${periodEnd}.`;
      break;
    case 'RENEWAL_DUE':
      status =
        'Your renewal payment is being processed. Pro features return as soon as Flutterwave confirms it.';
      break;
    case 'PAST_DUE':
      status =
        'Your renewal payment failed. Flutterwave will try the charge again; Pro features return when it succeeds.';
      break;
    default:
      status = subscription
        ? 'Your Aila Pro subscription has ended. Your account and data stay available.'
        : 'You do not have an Aila Pro subscription.';
  }

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
            {subscription ? (
              <Badge variant={state === 'ACTIVE' ? 'default' : 'outline'}>{STATE_BADGE[state]}</Badge>
            ) : null}
          </div>
          <CardDescription>
            One subscription for Intelligence, Writer, Translate, Ads, Legal and Coding, with
            advanced models and higher limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <p className="text-sm">{status}</p>

          {state === 'ENDED' ? (
            <div className="grid gap-2 text-sm text-muted-foreground">
              <TrialStatus trial={trial} />
            </div>
          ) : null}

          {billing.canSubscribe && billing.price ? (
            <div className="grid gap-3">
              <p className="font-serif text-2xl">
                {formatPrice(billing.price)}
                <span className="text-base text-muted-foreground"> per month</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Paid by card through Flutterwave and renewed monthly until you cancel.
              </p>
              <SubscribeButton />
            </div>
          ) : null}

          {state === 'ENDED' && billing.isOwner && !billing.price ? (
            <p role="alert" className="text-sm text-destructive">
              Subscriptions are unavailable right now. Please try again later.
            </p>
          ) : null}

          {billing.canCancel ? <CancelSubscription accessUntil={state === 'ACTIVE' ? periodEnd : null} /> : null}

          {!billing.isOwner ? (
            <p className="text-sm text-muted-foreground">Only the account owner can manage billing.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
