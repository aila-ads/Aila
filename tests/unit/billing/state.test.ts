import { describe, expect, it } from 'vitest';
import {
  addBillingPeriod,
  canCancel,
  cancellationUpdate,
  canStartCheckout,
  checkCharge,
  checkPlan,
  failedChargeMakesPastDue,
  RENEWAL_WAIT_MS,
  renewedPeriod,
  subscriptionState,
  toMinorUnits,
  type SubscriptionRecord,
} from '../../../packages/billing/src/state';
import type { FlutterwaveTransaction } from '../../../packages/billing/src/flutterwave';

const now = new Date('2026-10-09T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;

const tx = (overrides: Partial<FlutterwaveTransaction> = {}): FlutterwaveTransaction => ({
  id: 101,
  txRef: 'aila-ref',
  amount: 20,
  currency: 'USD',
  status: 'successful',
  createdAt: now,
  customerEmail: 'a@example.com',
  ...overrides,
});

const sub = (overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  status: 'ACTIVE',
  currentPeriodStart: new Date(now.getTime() - 10 * day),
  currentPeriodEnd: new Date(now.getTime() + 20 * day),
  cancelAtPeriodEnd: false,
  ...overrides,
});

describe('billing period', () => {
  it('adds one calendar month in UTC', () => {
    expect(addBillingPeriod(new Date('2026-10-09T12:00:00.000Z')).toISOString()).toBe(
      '2026-11-09T12:00:00.000Z',
    );
    expect(addBillingPeriod(new Date('2026-12-15T00:00:00.000Z')).toISOString()).toBe(
      '2027-01-15T00:00:00.000Z',
    );
  });

  it('clamps the 31st to the last day of a shorter month', () => {
    expect(addBillingPeriod(new Date('2027-01-31T08:00:00.000Z')).toISOString()).toBe(
      '2027-02-28T08:00:00.000Z',
    );
    expect(addBillingPeriod(new Date('2028-01-31T08:00:00.000Z')).toISOString()).toBe(
      '2028-02-29T08:00:00.000Z',
    );
  });

  it('extends from the current period end when a renewal is early, and never shortens access', () => {
    const current = sub();
    const early = renewedPeriod(current, now);
    expect(early.start).toEqual(current.currentPeriodEnd);

    const late = new Date(now.getTime() + 25 * day);
    expect(renewedPeriod(current, late).start).toEqual(late);
  });
});

describe('checkCharge (status, amount, currency, tx_ref)', () => {
  const expected = { txRef: 'aila-ref', amount: '20.00', currency: 'USD' };

  it('accepts a successful charge of exactly the expected amount and currency', () => {
    expect(checkCharge(tx(), expected)).toEqual({ outcome: 'SUCCEEDED' });
    expect(toMinorUnits('20.00')).toBe(toMinorUnits(20));
  });

  it('rejects a different tx_ref, currency or amount', () => {
    expect(checkCharge(tx({ txRef: 'other' }), expected)).toEqual({ outcome: 'MISMATCH', reason: 'TX_REF' });
    expect(checkCharge(tx({ currency: 'NGN' }), expected)).toEqual({ outcome: 'MISMATCH', reason: 'CURRENCY' });
    expect(checkCharge(tx({ amount: 19.99 }), expected)).toMatchObject({ outcome: 'MISMATCH', reason: 'AMOUNT' });
    expect(checkCharge(tx({ amount: 200 }), expected)).toMatchObject({ outcome: 'MISMATCH', reason: 'AMOUNT' });
  });

  it('never treats a failed or pending charge as paid', () => {
    expect(checkCharge(tx({ status: 'failed' }), expected)).toEqual({ outcome: 'FAILED' });
    expect(checkCharge(tx({ status: 'pending' }), expected)).toEqual({ outcome: 'PENDING' });
  });
});

describe('checkPlan', () => {
  const plan = { id: 77, amount: 20, currency: 'USD', interval: 'monthly', status: 'active' };

  it('accepts the configured active monthly plan', () => {
    expect(checkPlan(plan, 77)).toEqual({ ok: true });
  });

  it('refuses another plan, an inactive plan or another interval', () => {
    expect(checkPlan(plan, 78).ok).toBe(false);
    expect(checkPlan({ ...plan, status: 'cancelled' }, 77).ok).toBe(false);
    expect(checkPlan({ ...plan, interval: 'yearly' }, 77).ok).toBe(false);
  });
});

describe('subscription state transitions', () => {
  it('shows ACTIVE, CANCELLING, RENEWAL_DUE, PAST_DUE and ENDED', () => {
    expect(subscriptionState(sub(), now)).toBe('ACTIVE');
    expect(subscriptionState(sub({ cancelAtPeriodEnd: true }), now)).toBe('CANCELLING');

    const ended = { currentPeriodEnd: new Date(now.getTime() - 60_000) };
    expect(subscriptionState(sub(ended), now)).toBe('RENEWAL_DUE');
    expect(subscriptionState(sub({ ...ended, status: 'PAST_DUE' }), now)).toBe('PAST_DUE');
    expect(subscriptionState(sub({ ...ended, cancelAtPeriodEnd: true }), now)).toBe('ENDED');
    expect(
      subscriptionState(sub({ currentPeriodEnd: new Date(now.getTime() - RENEWAL_WAIT_MS) }), now),
    ).toBe('ENDED');
    expect(subscriptionState(sub({ status: 'CANCELLED' }), now)).toBe('ENDED');
  });

  it('allows a new checkout only when nothing is paid up or renewing', () => {
    expect(canStartCheckout(null, now)).toBe(true);
    expect(canStartCheckout(sub(), now)).toBe(false);
    expect(canStartCheckout(sub({ cancelAtPeriodEnd: true }), now)).toBe(false);
    expect(canStartCheckout(sub({ currentPeriodEnd: new Date(now.getTime() - 60_000) }), now)).toBe(false);
    expect(canStartCheckout(sub({ status: 'CANCELLED' }), now)).toBe(true);
  });

  it('allows cancelling only a renewing subscription', () => {
    expect(canCancel(sub(), now)).toBe(true);
    expect(canCancel(sub({ status: 'PAST_DUE', currentPeriodEnd: now }), now)).toBe(true);
    expect(canCancel(sub({ cancelAtPeriodEnd: true }), now)).toBe(false);
    expect(canCancel(sub({ status: 'CANCELLED' }), now)).toBe(false);
    expect(canCancel(null, now)).toBe(false);
  });

  it('cancels at period end while paid up, immediately otherwise, and only once', () => {
    expect(cancellationUpdate(sub(), now)).toEqual({ status: 'ACTIVE', cancelAtPeriodEnd: true });
    expect(cancellationUpdate(sub({ cancelAtPeriodEnd: true }), now)).toBeNull();
    expect(cancellationUpdate(sub({ status: 'PAST_DUE' }), now)).toEqual({
      status: 'CANCELLED',
      cancelAtPeriodEnd: false,
    });
    expect(cancellationUpdate(sub({ currentPeriodEnd: now }), now)).toEqual({
      status: 'CANCELLED',
      cancelAtPeriodEnd: false,
    });
    expect(cancellationUpdate(sub({ status: 'CANCELLED' }), now)).toBeNull();
  });

  it('marks PAST_DUE only for a failed charge newer than the current period', () => {
    expect(failedChargeMakesPastDue(sub(), now)).toBe(true);
    expect(failedChargeMakesPastDue(sub(), new Date(now.getTime() - 20 * day))).toBe(false);
    expect(failedChargeMakesPastDue(sub({ status: 'PAST_DUE' }), now)).toBe(false);
    expect(failedChargeMakesPastDue(sub({ cancelAtPeriodEnd: true }), now)).toBe(false);
  });
});
