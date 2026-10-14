import { describe, expect, it } from 'vitest';
import {
  accessUntil,
  addBillingPeriod,
  checkVerifiedCharge,
  oneMonthAccess,
  oneMonthRefusal,
  type AccessRow,
} from '../../../packages/billing/src/state';
import { confirmCheckoutSchema, startCheckoutSchema } from '../../../packages/validation/src/billing';
import { mapPaystackStatus, paystackAmounts } from '../../../packages/billing/src/paystack';
import { orderCharge } from '../../../packages/billing/src/paypal';

const now = new Date('2026-10-09T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;

const row = (overrides: Partial<AccessRow> = {}): AccessRow => ({
  id: 'sub_1',
  providerSubscriptionId: null,
  status: 'ACTIVE',
  currentPeriodStart: new Date(now.getTime() - 5 * day),
  currentPeriodEnd: new Date(now.getTime() + 10 * day),
  cancelAtPeriodEnd: true,
  ...overrides,
});

describe('one-month periods', () => {
  it('starts at payment time without current access', () => {
    expect(oneMonthAccess([], now)).toEqual({ extendId: null, start: now, end: addBillingPeriod(now) });
    expect(oneMonthAccess([row({ currentPeriodEnd: new Date(now.getTime() - day) })], now).extendId).toBeNull();
    expect(oneMonthAccess([row({ status: 'CANCELLED' })], now).extendId).toBeNull();
  });

  it('extends the latest one-month row from its end', () => {
    const latest = row({ id: 'sub_2', currentPeriodEnd: new Date(now.getTime() + 20 * day) });
    const period = oneMonthAccess([row(), latest], now);
    expect(period).toMatchObject({ extendId: 'sub_2', end: addBillingPeriod(latest.currentPeriodEnd as Date) });
  });

  it('adds a row after a card subscription instead of extending it', () => {
    const plan = row({ id: 'plan', providerSubscriptionId: '77' });
    const period = oneMonthAccess([plan], now);
    expect(period).toEqual({ extendId: null, start: plan.currentPeriodEnd, end: addBillingPeriod(plan.currentPeriodEnd as Date) });
  });

  it('reports the latest paid access', () => {
    expect(accessUntil([row(), row({ currentPeriodEnd: new Date(now.getTime() + 40 * day) })], now)).toEqual(
      new Date(now.getTime() + 40 * day),
    );
    expect(accessUntil([row({ currentPeriodEnd: new Date(now.getTime() - 1) })], now)).toBeNull();
  });

  it('refuses while the card plan renews and beyond about a year ahead', () => {
    const renewing = row({ providerSubscriptionId: '77', cancelAtPeriodEnd: false });
    expect(oneMonthRefusal(renewing, [renewing], now)).toBe('RENEWING_SUBSCRIPTION');
    expect(oneMonthRefusal(null, [row({ currentPeriodEnd: new Date(now.getTime() + 300 * day) })], now)).toBeNull();
    expect(oneMonthRefusal(null, [row({ currentPeriodEnd: new Date(now.getTime() + 340 * day) })], now)).toBe('PREPAID_LIMIT');
  });
});

describe('verified charge checks', () => {
  const charge = { txRef: 'aila-1', amount: '5100.00', currency: 'NGN', status: 'SUCCEEDED' as const };
  const expected = { txRef: 'aila-1', amount: '5100.00', currency: 'NGN' };

  it('accepts only the exact reference, currency and amount', () => {
    expect(checkVerifiedCharge(charge, expected)).toEqual({ outcome: 'SUCCEEDED' });
    expect(checkVerifiedCharge({ ...charge, amount: 5100 }, expected)).toEqual({ outcome: 'SUCCEEDED' });
    expect(checkVerifiedCharge({ ...charge, txRef: 'aila-2' }, expected)).toMatchObject({ reason: 'TX_REF' });
    expect(checkVerifiedCharge({ ...charge, currency: 'USD' }, expected)).toMatchObject({ reason: 'CURRENCY' });
    expect(checkVerifiedCharge({ ...charge, amount: '5099.99' }, expected)).toMatchObject({ reason: 'AMOUNT' });
    expect(checkVerifiedCharge({ ...charge, status: 'PENDING' }, expected)).toEqual({ outcome: 'PENDING' });
    expect(checkVerifiedCharge({ ...charge, status: 'FAILED' }, expected)).toEqual({ outcome: 'FAILED' });
  });

  it('compares the price before fees passed on to the customer', () => {
    // Paystack: requested_amount 5100.00, the customer paid 5277.67 with fees.
    expect(checkVerifiedCharge({ ...charge, chargedAmount: '5277.67' }, expected)).toEqual({ outcome: 'SUCCEEDED' });
    // The charged amount alone is never the price when the price is known.
    expect(checkVerifiedCharge({ ...charge, amount: '5277.67', chargedAmount: '5277.67' }, expected)).toMatchObject({
      reason: 'AMOUNT',
      detail: { expectedMinor: 510000, priceMinor: 527767, chargedMinor: 527767 },
    });
    // Charged less than the price: refused even if the price matches.
    expect(checkVerifiedCharge({ ...charge, chargedAmount: '5000.00' }, expected)).toMatchObject({ reason: 'AMOUNT' });
    // Price derived as charged minus fees: fees passed on, or borne by the merchant.
    expect(
      checkVerifiedCharge({ ...charge, chargedAmount: '5277.67', amountIsNetOfFees: true }, expected),
    ).toEqual({ outcome: 'SUCCEEDED' });
    expect(
      checkVerifiedCharge({ ...charge, amount: '5023.50', chargedAmount: '5100.00', amountIsNetOfFees: true }, expected),
    ).toEqual({ outcome: 'SUCCEEDED' });
    expect(
      checkVerifiedCharge({ ...charge, amount: '5023.50', chargedAmount: '5101.00', amountIsNetOfFees: true }, expected),
    ).toMatchObject({ reason: 'AMOUNT' });
  });

  it('derives the Paystack price from requested_amount, then amount - fees, then amount', () => {
    expect(paystackAmounts({ amount: 517767, requested_amount: 500000, fees: 17767 })).toEqual({
      priceMinor: 500000,
      chargedMinor: 517767,
      netOfFees: false,
    });
    expect(paystackAmounts({ amount: 517767, requested_amount: null, fees: 17767 })).toEqual({
      priceMinor: 500000,
      chargedMinor: 517767,
      netOfFees: true,
    });
    expect(paystackAmounts({ amount: 500000 })).toEqual({ priceMinor: 500000, chargedMinor: 500000, netOfFees: false });
    expect(paystackAmounts({ amount: 500000, fees: 0 })).toEqual({ priceMinor: 500000, chargedMinor: 500000, netOfFees: false });
  });

  it('maps Paystack statuses', () => {
    expect(mapPaystackStatus('success')).toBe('SUCCEEDED');
    expect(mapPaystackStatus('abandoned')).toBe('FAILED');
    expect(mapPaystackStatus('reversed')).toBe('FAILED');
    expect(mapPaystackStatus('ongoing')).toBe('PENDING');
  });

  it('maps PayPal orders from their capture', () => {
    const base = { id: 'O1', status: 'COMPLETED', purchase_units: [{ custom_id: 'aila-1', amount: { currency_code: 'USD', value: '4.00' } }] };
    const capture = (status: string) => ({
      ...base,
      purchase_units: [{ ...base.purchase_units[0], payments: { captures: [{ id: 'C1', status, amount: { currency_code: 'USD', value: '4.00' }, create_time: now.toISOString() }] } }],
    });
    expect(orderCharge(capture('COMPLETED'))).toMatchObject({ status: 'SUCCEEDED', txRef: 'aila-1', amount: '4.00', providerTransactionId: 'O1' });
    expect(orderCharge(capture('DECLINED')).status).toBe('FAILED');
    expect(orderCharge(capture('PENDING')).status).toBe('PENDING');
    expect(orderCharge({ ...base, status: 'APPROVED' }).status).toBe('PENDING');
    expect(orderCharge({ ...base, status: 'VOIDED' }).status).toBe('FAILED');
  });
});

describe('billing input', () => {
  it('accepts only known methods and well-formed return values', () => {
    expect(startCheckoutSchema.safeParse({ method: 'PAYSTACK' }).success).toBe(true);
    expect(startCheckoutSchema.safeParse({ method: 'STRIPE' }).success).toBe(false);
    expect(confirmCheckoutSchema.parse({ provider: 'FLUTTERWAVE', transactionId: '42' })).toEqual({ provider: 'FLUTTERWAVE', transactionId: 42 });
    expect(confirmCheckoutSchema.safeParse({ provider: 'PAYSTACK', reference: 'aila-123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
    expect(confirmCheckoutSchema.safeParse({ provider: 'PAYSTACK', reference: '../etc' }).success).toBe(false);
    expect(confirmCheckoutSchema.safeParse({ provider: 'PAYPAL', orderId: '5O190127TN364715T' }).success).toBe(true);
    expect(confirmCheckoutSchema.safeParse({ provider: 'PAYPAL', orderId: 'x/../y' }).success).toBe(false);
  });
});
