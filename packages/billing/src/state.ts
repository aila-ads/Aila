import type { FlutterwavePlan, FlutterwaveTransaction } from './flutterwave';

/**
 * The Aila Pro subscription state machine (DATABASE-SCHEMA §14,
 * DATA-ARCHITECTURE §12-13, PRODUCT-SPEC §23). Pure functions with no I/O;
 * Flutterwave values are mapped here and nowhere else.
 *
 * Stored statuses used:
 *   (no row) ──first verified payment──▶ ACTIVE
 *   ACTIVE ──verified renewal──▶ ACTIVE (period extended)
 *   ACTIVE ──verified failed renewal──▶ PAST_DUE ──verified renewal──▶ ACTIVE
 *   ACTIVE ──cancelled──▶ ACTIVE + cancelAtPeriodEnd (access until period end)
 *   PAST_DUE ──cancelled──▶ CANCELLED
 *
 * Access comes only from ACTIVE with a current period end
 * (packages/auth/src/trial.ts); an ACTIVE row whose period has ended gives
 * no access until a verified renewal extends it.
 */

/** Aila Pro renews monthly; the Flutterwave plan must use this interval. */
export const PLAN_INTERVAL = 'monthly';

/** How long a hosted checkout link stays open (Flutterwave session_duration). */
export const CHECKOUT_SESSION_MINUTES = 30;

/**
 * After a period ends without cancellation, Flutterwave charges the renewal
 * and retries failures three times, 30 minutes apart (Flutterwave payment
 * plan docs). A new checkout is refused for this long so the customer is
 * not subscribed twice while a renewal is still on its way.
 */
export const RENEWAL_WAIT_MS = 24 * 60 * 60 * 1000;

/** Amounts are compared in minor units, so 20 and 20.00 match and 19.999 does not. */
export function toMinorUnits(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

/** One calendar month later in UTC; the 31st becomes the month's last day. */
export function addBillingPeriod(start: Date): Date {
  const end = new Date(start.getTime());
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export type PlanCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The configured plan must be active, monthly and priced. */
export function checkPlan(plan: FlutterwavePlan, planId: number): PlanCheck {
  if (plan.id !== planId) {
    return { ok: false, reason: 'PLAN_ID_MISMATCH' };
  }

  if (plan.status !== 'active') {
    return { ok: false, reason: 'PLAN_INACTIVE' };
  }

  if (plan.interval !== PLAN_INTERVAL) {
    return { ok: false, reason: 'PLAN_INTERVAL_NOT_MONTHLY' };
  }

  return toMinorUnits(plan.amount) > 0 ? { ok: true } : { ok: false, reason: 'PLAN_AMOUNT_INVALID' };
}

export type ExpectedCharge = {
  readonly txRef?: string;
  readonly amount: number | string;
  readonly currency: string;
};

export type ChargeCheck =
  | { readonly outcome: 'SUCCEEDED' | 'FAILED' | 'PENDING' }
  | { readonly outcome: 'MISMATCH'; readonly reason: 'TX_REF' | 'CURRENCY' | 'AMOUNT' };

/**
 * Compares a verified Flutterwave transaction with what Aila expects
 * (Flutterwave webhook best practice: status, amount, currency, tx_ref).
 * A mismatch is never treated as a payment.
 */
export function checkCharge(transaction: FlutterwaveTransaction, expected: ExpectedCharge): ChargeCheck {
  if (expected.txRef !== undefined && transaction.txRef !== expected.txRef) {
    return { outcome: 'MISMATCH', reason: 'TX_REF' };
  }

  if (transaction.currency !== expected.currency) {
    return { outcome: 'MISMATCH', reason: 'CURRENCY' };
  }

  if (transaction.status === 'successful') {
    return toMinorUnits(transaction.amount) === toMinorUnits(expected.amount)
      ? { outcome: 'SUCCEEDED' }
      : { outcome: 'MISMATCH', reason: 'AMOUNT' };
  }

  return { outcome: transaction.status === 'failed' ? 'FAILED' : 'PENDING' };
}

export type SubscriptionRecord = {
  readonly status: string;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
};

/** The period after a verified successful renewal. Never shortens access. */
export function renewedPeriod(
  subscription: SubscriptionRecord,
  paidAt: Date,
): { readonly start: Date; readonly end: Date } {
  const previousEnd = subscription.currentPeriodEnd;
  const start = previousEnd && previousEnd.getTime() > paidAt.getTime() ? previousEnd : paidAt;
  return { start, end: addBillingPeriod(start) };
}

/**
 * Whether a failed charge should mark the subscription PAST_DUE: only an
 * ACTIVE one, and only for a charge newer than the current period's start,
 * so a late-arriving old failure cannot undo a later renewal.
 */
export function failedChargeMakesPastDue(subscription: SubscriptionRecord, chargedAt: Date): boolean {
  return (
    subscription.status === 'ACTIVE' &&
    !subscription.cancelAtPeriodEnd &&
    (subscription.currentPeriodStart === null ||
      chargedAt.getTime() > subscription.currentPeriodStart.getTime())
  );
}

/** The stored change for a cancellation (by the customer, Aila or Flutterwave). */
export function cancellationUpdate(
  subscription: SubscriptionRecord,
  now: Date,
): { readonly status: 'ACTIVE' | 'CANCELLED'; readonly cancelAtPeriodEnd: boolean } | null {
  if (subscription.status === 'ACTIVE') {
    const paidUp =
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd.getTime() > now.getTime();
    return paidUp
      ? subscription.cancelAtPeriodEnd
        ? null
        : { status: 'ACTIVE', cancelAtPeriodEnd: true }
      : { status: 'CANCELLED', cancelAtPeriodEnd: false };
  }

  return subscription.status === 'PAST_DUE' ? { status: 'CANCELLED', cancelAtPeriodEnd: false } : null;
}

export type SubscriptionState =
  /** Paid up and renewing. */
  | 'ACTIVE'
  /** Paid up; cancelled, so it ends at the period end. */
  | 'CANCELLING'
  /** The period has ended and the renewal charge has not been confirmed yet. */
  | 'RENEWAL_DUE'
  /** The renewal charge failed; Flutterwave retries it. */
  | 'PAST_DUE'
  /** No longer active. */
  | 'ENDED';

/** What the customer sees, derived from the stored state at server time `now`. */
export function subscriptionState(subscription: SubscriptionRecord, now: Date): SubscriptionState {
  const end = subscription.currentPeriodEnd?.getTime() ?? 0;
  const t = now.getTime();

  if (subscription.status === 'ACTIVE') {
    if (end > t) {
      return subscription.cancelAtPeriodEnd ? 'CANCELLING' : 'ACTIVE';
    }

    return !subscription.cancelAtPeriodEnd && t - end < RENEWAL_WAIT_MS ? 'RENEWAL_DUE' : 'ENDED';
  }

  if (subscription.status === 'PAST_DUE') {
    return t - end < RENEWAL_WAIT_MS ? 'PAST_DUE' : 'ENDED';
  }

  return 'ENDED';
}

/** A new checkout is allowed only when no subscription is paid up or renewing. */
export function canStartCheckout(subscription: SubscriptionRecord | null, now: Date): boolean {
  return subscription === null || subscriptionState(subscription, now) === 'ENDED';
}

/** The customer may cancel while the subscription is still renewing. */
export function canCancel(subscription: SubscriptionRecord | null, now: Date): boolean {
  if (!subscription) {
    return false;
  }

  const state = subscriptionState(subscription, now);
  return state === 'ACTIVE' || state === 'RENEWAL_DUE' || state === 'PAST_DUE';
}
