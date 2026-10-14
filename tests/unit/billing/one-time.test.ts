import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { table, type Row } from './memory-db';

/**
 * One-month Aila Pro purchases through Flutterwave (every method),
 * Paystack and PayPal, against an in-memory database and mocked provider
 * APIs: signatures, server-side verification, period stacking and
 * idempotency.
 */

const db = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof table>> & Record<string, unknown>);

function resetDb() {
  Object.assign(db, {
    payment: table('payment', [['provider', 'providerTransactionId']], {
      status: 'PENDING',
      providerTransactionId: null,
      subscriptionId: null,
      checkoutUrl: null,
      checkoutExpiresAt: null,
      paidAt: null,
      oneTime: false,
    }),
    subscription: table('subscription', [['provider', 'providerSubscriptionId']], {
      providerSubscriptionId: null,
      providerCustomerId: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }),
    billingEvent: table('event', [['provider', 'providerEventId']], { processedAt: null, errorCode: null }),
    trial: table('trial'),
    auditLog: table('audit'),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    $queryRaw: vi.fn(async () => []),
  });
}

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  auditLogData: (event: Row) => event,
  authorize: (allowed: boolean) => {
    if (!allowed) throw new Error('FORBIDDEN');
  },
  isAccountOwner: (ctx: { membership: { role: string } }) => ctx.membership.role === 'OWNER',
  recordAuditEvent: async (event: Row) => {
    (db.auditLog as ReturnType<typeof table>).rows.push(event);
  },
  withinRateLimits: async () => true,
}));

const { handleFlutterwaveWebhook, handlePaystackWebhook, handlePaypalWebhook } = await import(
  '../../../packages/billing/src/handler'
);
const { confirmCheckout, getBillingSummary, startCheckout } = await import(
  '../../../packages/billing/src/service'
);
const { verifyPaystackSignature } = await import('../../../packages/billing/src/paystack');
const { resetPaypalToken } = await import('../../../packages/billing/src/paypal');
const { addBillingPeriod } = await import('../../../packages/billing/src/state');

const FLW_HASH = 'h'.repeat(64);
const PAYSTACK_KEY = `sk_live_${'k'.repeat(40)}`;
const PLAN_ID = 4242;
const PAID_AT = new Date(Date.now() - 60_000);

const ctx = {
  user: { id: 'user_1', email: 'owner@example.com', name: 'Owner', role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date(Date.now() + 3_600_000) },
};

const providers = {
  flutterwave: new Map<number, Row>(),
  paystack: new Map<string, Row>(),
  paypal: new Map<string, Row>(),
  paypalVerify: 'SUCCESS',
  captures: 0,
  orders: 0,
};

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;

  if (url.hostname === 'api.flutterwave.com') {
    const ok = (data: unknown) => Response.json({ status: 'success', data });
    const path = url.pathname.replace('/v3', '');
    if (path === `/payment-plans/${PLAN_ID}`) return ok({ id: PLAN_ID, amount: 5100, currency: 'NGN', interval: 'monthly', status: 'active' });
    if (path === '/payments') return ok({ link: 'https://checkout.flutterwave.com/v3/hosted/pay/once' });
    const verify = path.match(/^\/transactions\/(\d+)\/verify$/);
    if (verify) {
      const tx = providers.flutterwave.get(Number(verify[1]));
      return tx
        ? ok({ ...tx, created_at: PAID_AT.toISOString(), customer: { email: 'owner@example.com' } })
        : Response.json({ status: 'error' }, { status: 400 });
    }
    if (path === '/subscriptions') return Response.json({ status: 'success', data: [] });
  }

  if (url.hostname === 'api.paystack.co') {
    if (url.pathname === '/transaction/initialize') {
      return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc123', access_code: 'abc123', reference: body.reference } });
    }
    const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/);
    if (verify) {
      const tx = providers.paystack.get(decodeURIComponent(verify[1]));
      return tx
        ? Response.json({ status: true, data: { ...tx, paid_at: PAID_AT.toISOString() } })
        : Response.json({ status: false, message: 'Transaction reference not found' }, { status: 400 });
    }
  }

  if (url.hostname === 'api-m.paypal.com') {
    if (url.pathname === '/v1/oauth2/token') return Response.json({ access_token: 'token', expires_in: 3600 });
    if (url.pathname === '/v1/notifications/verify-webhook-signature') {
      return Response.json({ verification_status: providers.paypalVerify });
    }
    if (url.pathname === '/v2/checkout/orders' && init?.method === 'POST') {
      providers.orders += 1;
      const id = `ORDER${providers.orders}`;
      const unit = body.purchase_units[0];
      providers.paypal.set(id, { id, status: 'PAYER_ACTION_REQUIRED', purchase_units: [{ custom_id: unit.custom_id, amount: unit.amount }] });
      return Response.json({ id, status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: `https://www.paypal.com/checkoutnow?token=${id}` }] });
    }
    const capture = url.pathname.match(/^\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/);
    if (capture) {
      const order = providers.paypal.get(capture[1])!;
      if (order.status === 'COMPLETED') {
        return Response.json({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, { status: 422 });
      }
      providers.captures += 1;
      const unit = (order.purchase_units as Row[])[0];
      order.status = 'COMPLETED';
      unit.payments = { captures: [{ id: `CAP${capture[1]}`, status: 'COMPLETED', amount: unit.amount, create_time: PAID_AT.toISOString() }] };
      return Response.json(order, { status: 201 });
    }
    const get = url.pathname.match(/^\/v2\/checkout\/orders\/([A-Z0-9]+)$/);
    if (get) {
      const order = providers.paypal.get(get[1]);
      return order ? Response.json(order) : Response.json({ name: 'RESOURCE_NOT_FOUND' }, { status: 404 });
    }
  }

  return new Response('not found', { status: 404 });
});

const rows = (name: string) => (db[name] as ReturnType<typeof table>).rows;

beforeEach(() => {
  resetDb();
  providers.flutterwave.clear();
  providers.paystack.clear();
  providers.paypal.clear();
  providers.paypalVerify = 'SUCCESS';
  providers.captures = 0;
  providers.orders = 0;
  resetPaypalToken();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('FLUTTERWAVE_SECRET_KEY', 'FLWSECK-live-X');
  vi.stubEnv('FLUTTERWAVE_WEBHOOK_SECRET_HASH', FLW_HASH);
  vi.stubEnv('FLUTTERWAVE_PRO_PLAN_ID', String(PLAN_ID));
  vi.stubEnv('PAYSTACK_SECRET_KEY', PAYSTACK_KEY);
  vi.stubEnv('PAYPAL_CLIENT_ID', 'client-id');
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('PAYPAL_WEBHOOK_ID', 'WH-1234');
  vi.stubEnv('AILA_PRO_PRICE_USD', '4');
  rows('trial').push({ id: 'trial_1', accountId: 'acct_1', status: 'ACTIVE' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function lastPayment(): Row {
  return rows('payment').at(-1)!;
}

function flwWebhook(id: number): Request {
  return new Request('https://ailaxx.com/api/webhooks/flutterwave', {
    method: 'POST',
    headers: { 'verif-hash': FLW_HASH, 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'charge.completed', data: { id, status: 'successful' } }),
  });
}

function paystackWebhook(payload: unknown, key = PAYSTACK_KEY): Request {
  const body = JSON.stringify(payload);
  return new Request('https://ailaxx.com/api/webhooks/paystack', {
    method: 'POST',
    headers: { 'x-paystack-signature': createHmac('sha512', key).update(body).digest('hex'), 'content-type': 'application/json' },
    body,
  });
}

function paypalWebhook(payload: unknown, headers: Record<string, string> | null = {}): Request {
  return new Request('https://ailaxx.com/api/webhooks/paypal', {
    method: 'POST',
    headers:
      headers === null
        ? { 'content-type': 'application/json' }
        : {
            'paypal-auth-algo': 'SHA256withRSA',
            'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1',
            'paypal-transmission-id': 'tid-1',
            'paypal-transmission-sig': 'sig',
            'paypal-transmission-time': new Date().toISOString(),
            'content-type': 'application/json',
            ...headers,
          },
    body: JSON.stringify(payload),
  });
}

async function buyWithFlutterwave(id: number, overrides: Row = {}): Promise<Row> {
  await startCheckout(ctx, 'FLUTTERWAVE', 'req');
  const payment = lastPayment();
  providers.flutterwave.set(id, { id, tx_ref: payment.txRef, amount: 5100, currency: 'NGN', status: 'successful', ...overrides });
  return payment;
}

describe('Flutterwave one-month purchase with every method', () => {
  it('creates a one-time checkout without a payment plan and with every payment option', async () => {
    const { url } = await startCheckout(ctx, 'FLUTTERWAVE', 'req');
    expect(url).toBe('https://checkout.flutterwave.com/v3/hosted/pay/once');

    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/v3/payments'))!;
    const body = JSON.parse(String(init?.body));
    expect(body.payment_plan).toBeUndefined();
    for (const option of ['card', 'banktransfer', 'ussd', 'account', 'nqr', 'barter', 'applepay', 'googlepay', 'mobilemoneyghana', 'mobilemoneyfranco', 'mpesa']) {
      expect(body.payment_options.split(', ')).toContain(option);
    }
    expect(body).toMatchObject({ amount: 5100, currency: 'NGN', redirect_url: 'https://ailaxx.com/billing' });
    expect(lastPayment()).toMatchObject({ provider: 'FLUTTERWAVE', oneTime: true, currency: 'NGN' });
    expect(String(lastPayment().amount)).toBe('5100.00');
  });

  it('grants one month from a verified webhook, without any plan subscription', async () => {
    await buyWithFlutterwave(801);
    expect((await handleFlutterwaveWebhook(flwWebhook(801))).status).toBe(200);

    expect(rows('subscription')).toHaveLength(1);
    expect(rows('subscription')[0]).toMatchObject({
      provider: 'FLUTTERWAVE',
      providerSubscriptionId: null,
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodStart: PAID_AT,
      currentPeriodEnd: addBillingPeriod(PAID_AT),
    });
    expect(rows('trial')[0].status).toBe('CONVERTED');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/subscriptions'))).toBe(false);
  });

  it('never grants on a wrong amount or currency', async () => {
    await buyWithFlutterwave(802, { amount: 100 });
    await handleFlutterwaveWebhook(flwWebhook(802));
    providers.flutterwave.set(803, { id: 803, tx_ref: lastPayment().txRef, amount: 5100, currency: 'USD', status: 'successful' });
    await handleFlutterwaveWebhook(flwWebhook(803));

    expect(rows('subscription')).toHaveLength(0);
    expect(rows('billingEvent').map((row) => row.errorCode)).toEqual(['MISMATCH_AMOUNT', 'MISMATCH_CURRENCY']);
  });

  it('applies the return page and the webhook once', async () => {
    await buyWithFlutterwave(804);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 804 }, 'req');
    await handleFlutterwaveWebhook(flwWebhook(804));
    rows('billingEvent').length = 0;
    await handleFlutterwaveWebhook(flwWebhook(804));
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 804 }, 'req');

    expect(rows('subscription')).toHaveLength(1);
    expect(rows('subscription')[0].currentPeriodEnd).toEqual(addBillingPeriod(PAID_AT));
  });
});

describe('period stacking', () => {
  it('extends the current access by one month per purchase, across providers', async () => {
    await buyWithFlutterwave(811);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 811 }, 'req');
    const firstEnd = rows('subscription')[0].currentPeriodEnd as Date;

    await startCheckout(ctx, 'PAYSTACK', 'req');
    const reference = lastPayment().txRef as string;
    providers.paystack.set(reference, { id: 9001, status: 'success', reference, amount: 510000, currency: 'NGN' });
    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });

    expect(rows('subscription')).toHaveLength(1);
    expect(rows('subscription')[0].currentPeriodEnd).toEqual(addBillingPeriod(firstEnd));
    expect(rows('payment').filter((row) => row.status === 'SUCCEEDED')).toHaveLength(2);
    expect(rows('auditLog').some((row) => (row.metadata as Row)?.event === 'ACCESS_EXTENDED')).toBe(true);
  });

  it('starts after a cancelled card subscription ends instead of overlapping it', async () => {
    const planEnd = new Date(Date.now() + 10 * 86_400_000);
    rows('subscription').push({
      id: 'plan_sub', accountId: 'acct_1', provider: 'FLUTTERWAVE', plan: 'AILA_PRO', providerSubscriptionId: '77',
      status: 'ACTIVE', currentPeriodStart: new Date(Date.now() - 20 * 86_400_000), currentPeriodEnd: planEnd,
      cancelAtPeriodEnd: true, canceledAt: new Date(), createdAt: new Date(),
    });

    await buyWithFlutterwave(812);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 812 }, 'req');

    const added = rows('subscription').find((row) => row.providerSubscriptionId === null)!;
    expect(added).toMatchObject({ currentPeriodStart: planEnd, currentPeriodEnd: addBillingPeriod(planEnd) });
  });

  it('refuses a one-month purchase while the card subscription still renews', async () => {
    rows('subscription').push({
      id: 'plan_sub', accountId: 'acct_1', provider: 'FLUTTERWAVE', plan: 'AILA_PRO', providerSubscriptionId: '78',
      status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86_400_000),
      cancelAtPeriodEnd: false, canceledAt: null, createdAt: new Date(),
    });
    await expect(startCheckout(ctx, 'PAYPAL', 'req')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses the card subscription while one-month access is paid', async () => {
    await buyWithFlutterwave(813);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 813 }, 'req');
    await expect(startCheckout(ctx, 'FLUTTERWAVE_CARD_PLAN', 'req')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('Paystack', () => {
  it('checks the HMAC-SHA512 signature in constant time', () => {
    const body = '{"event":"charge.success"}';
    const good = createHmac('sha512', PAYSTACK_KEY).update(body).digest('hex');
    expect(verifyPaystackSignature(body, good, PAYSTACK_KEY)).toBe(true);
    expect(verifyPaystackSignature(`${body} `, good, PAYSTACK_KEY)).toBe(false);
    expect(verifyPaystackSignature(body, createHmac('sha512', 'other').update(body).digest('hex'), PAYSTACK_KEY)).toBe(false);
    expect(verifyPaystackSignature(body, 'abc', PAYSTACK_KEY)).toBe(false);
    expect(verifyPaystackSignature(body, null, PAYSTACK_KEY)).toBe(false);
  });

  it('initializes a live transaction with every channel and the price in kobo', async () => {
    const { url } = await startCheckout(ctx, 'PAYSTACK', 'req');
    expect(url).toBe('https://checkout.paystack.com/abc123');
    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/transaction/initialize'))!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      amount: '510000',
      currency: 'NGN',
      email: 'owner@example.com',
      callback_url: 'https://ailaxx.com/billing',
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer', 'apple_pay'],
    });
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${PAYSTACK_KEY}`);
  });

  it('rejects a forged webhook without touching the database or Paystack', async () => {
    const response = await handlePaystackWebhook(
      paystackWebhook({ event: 'charge.success', data: { id: 1, reference: 'aila-x' } }, 'sk_live_wrong'),
    );
    expect(response.status).toBe(401);
    expect(rows('billingEvent')).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('grants one month from charge.success after verifying, once per event', async () => {
    await startCheckout(ctx, 'PAYSTACK', 'req');
    const reference = lastPayment().txRef as string;
    providers.paystack.set(reference, { id: 9101, status: 'success', reference, amount: 510000, currency: 'NGN' });
    const event = { event: 'charge.success', data: { id: 9101, reference, amount: 1, status: 'success' } };

    expect((await handlePaystackWebhook(paystackWebhook(event))).status).toBe(200);
    expect((await handlePaystackWebhook(paystackWebhook(event))).status).toBe(200);

    expect(rows('billingEvent')).toHaveLength(1);
    expect(rows('subscription')).toHaveLength(1);
    expect(lastPayment()).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: '9101' });
  });

  it('does not grant when Paystack reports a different amount or a failure', async () => {
    await startCheckout(ctx, 'PAYSTACK', 'req');
    const reference = lastPayment().txRef as string;
    providers.paystack.set(reference, { id: 9102, status: 'success', reference, amount: 100, currency: 'NGN' });
    await handlePaystackWebhook(paystackWebhook({ event: 'charge.success', data: { id: 9102, reference } }));
    expect(rows('subscription')).toHaveLength(0);
    expect(rows('billingEvent')[0].errorCode).toBe('MISMATCH_AMOUNT');

    providers.paystack.set(reference, { id: 9102, status: 'failed', reference, amount: 510000, currency: 'NGN' });
    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference }, 'req')).resolves.toEqual({ outcome: 'FAILED' });
    expect(rows('subscription')).toHaveLength(0);
  });

  it('ignores references that are not Aila checkouts', async () => {
    const response = await handlePaystackWebhook(
      paystackWebhook({ event: 'charge.success', data: { id: 9103, reference: 'someone-else' } }),
    );
    expect(response.status).toBe(200);
    expect(rows('billingEvent')[0].errorCode).toBe('UNKNOWN_REFERENCE');
  });

  it('refuses a reference from another account on the return page', async () => {
    await startCheckout(ctx, 'PAYSTACK', 'req');
    const reference = lastPayment().txRef as string;
    const other = { ...ctx, account: { id: 'acct_2' } };
    await expect(confirmCheckout(other, { provider: 'PAYSTACK', reference }, 'req')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('PayPal', () => {
  it('creates a live order in USD from AILA_PRO_PRICE_USD', async () => {
    const { url } = await startCheckout(ctx, 'PAYPAL', 'req');
    expect(url).toBe('https://www.paypal.com/checkoutnow?token=ORDER1');
    expect(lastPayment()).toMatchObject({ provider: 'PAYPAL', currency: 'USD', providerTransactionId: 'ORDER1', oneTime: true });
    expect(String(lastPayment().amount)).toBe('4.00');
    const [input, init] = fetchMock.mock.calls.find(([value]) => String(value).endsWith('/v2/checkout/orders'))!;
    expect(String(input).startsWith('https://api-m.paypal.com/')).toBe(true);
    expect(JSON.parse(String(init?.body)).purchase_units[0]).toMatchObject({
      custom_id: lastPayment().txRef,
      amount: { currency_code: 'USD', value: '4.00' },
    });
  });

  it('captures on the server when the customer returns, once', async () => {
    await startCheckout(ctx, 'PAYPAL', 'req');
    providers.paypal.get('ORDER1')!.status = 'APPROVED';

    await expect(confirmCheckout(ctx, { provider: 'PAYPAL', orderId: 'ORDER1' }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });
    await expect(confirmCheckout(ctx, { provider: 'PAYPAL', orderId: 'ORDER1' }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });

    expect(providers.captures).toBe(1);
    expect(rows('subscription')).toHaveLength(1);
    expect(rows('subscription')[0]).toMatchObject({ provider: 'PAYPAL', cancelAtPeriodEnd: true });
  });

  it('rejects webhooks without signature headers or that PayPal does not verify', async () => {
    const event = { id: 'WH-EVT-1', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORDER1' } };
    expect((await handlePaypalWebhook(paypalWebhook(event, null))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    providers.paypalVerify = 'FAILURE';
    expect((await handlePaypalWebhook(paypalWebhook(event))).status).toBe(401);
    expect((await handlePaypalWebhook(paypalWebhook(event, { 'paypal-cert-url': 'https://evil.example/cert' }))).status).toBe(401);
    expect(rows('billingEvent')).toHaveLength(0);

    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/verify-webhook-signature'))!;
    expect(JSON.parse(String(init?.body))).toMatchObject({ webhook_id: 'WH-1234', transmission_id: 'tid-1', webhook_event: event });
  });

  it('captures and grants from a verified CHECKOUT.ORDER.APPROVED, then ignores the capture event', async () => {
    await startCheckout(ctx, 'PAYPAL', 'req');
    providers.paypal.get('ORDER1')!.status = 'APPROVED';

    const approved = { id: 'WH-EVT-2', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORDER1' } };
    expect((await handlePaypalWebhook(paypalWebhook(approved))).status).toBe(200);
    expect((await handlePaypalWebhook(paypalWebhook(approved))).status).toBe(200);
    const completed = {
      id: 'WH-EVT-3',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPORDER1', supplementary_data: { related_ids: { order_id: 'ORDER1' } } },
    };
    expect((await handlePaypalWebhook(paypalWebhook(completed))).status).toBe(200);

    expect(providers.captures).toBe(1);
    expect(rows('subscription')).toHaveLength(1);
    expect(rows('subscription')[0].currentPeriodEnd).toEqual(addBillingPeriod(PAID_AT));
    expect(rows('billingEvent')).toHaveLength(2);
  });

  it('does not grant an order that was never approved', async () => {
    await startCheckout(ctx, 'PAYPAL', 'req');
    await expect(confirmCheckout(ctx, { provider: 'PAYPAL', orderId: 'ORDER1' }, 'req')).resolves.toEqual({ outcome: 'PENDING' });
    expect(providers.captures).toBe(0);
    expect(rows('subscription')).toHaveLength(0);
  });
});

describe('billing page options', () => {
  it('lists only configured providers with their prices', async () => {
    vi.stubEnv('PAYPAL_CLIENT_SECRET', '');
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    const summary = await getBillingSummary(ctx, 'req');
    expect(summary.options.map((option) => option.method)).toEqual(['FLUTTERWAVE', 'FLUTTERWAVE_CARD_PLAN']);
    expect(summary.options[0].price).toEqual({ amount: '5100.00', currency: 'NGN' });
    expect(summary.canBuy).toBe(true);
    await expect(startCheckout(ctx, 'PAYPAL', 'req')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('shows every provider when all are configured, and no card plan while access is paid', async () => {
    const summary = await getBillingSummary(ctx, 'req');
    expect(summary.options.map((option) => option.method)).toEqual(['FLUTTERWAVE', 'PAYSTACK', 'FLUTTERWAVE_CARD_PLAN', 'PAYPAL']);
    expect(summary.options.at(-1)!.price).toEqual({ amount: '4.00', currency: 'USD' });

    await buyWithFlutterwave(821);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 821 }, 'req');
    const after = await getBillingSummary(ctx, 'req');
    expect(after.options.map((option) => option.method)).toEqual(['FLUTTERWAVE', 'PAYSTACK', 'PAYPAL']);
    expect(after.prepaidUntil).toBe(addBillingPeriod(PAID_AT).toISOString());
  });
});

describe('provider fees passed on to the customer', () => {
  async function paystackCheckout(): Promise<string> {
    await startCheckout(ctx, 'PAYSTACK', 'req');
    return lastPayment().txRef as string;
  }

  it('grants a Paystack charge whose amount includes fees, from the webhook', async () => {
    const reference = await paystackCheckout();
    // A bank payment: 5100.00 requested, 177.67 fees paid by the customer.
    providers.paystack.set(reference, {
      id: 9201, status: 'success', reference, amount: 527767, requested_amount: 510000, fees: 17767,
      currency: 'NGN', channel: 'bank',
    });
    const event = { event: 'charge.success', data: { id: 9201, reference, amount: 527767, requested_amount: 510000, status: 'success' } };

    expect((await handlePaystackWebhook(paystackWebhook(event))).status).toBe(200);
    expect(rows('billingEvent')[0].errorCode).toBeNull();
    expect(rows('subscription')).toHaveLength(1);
    expect(lastPayment()).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: '9201' });
    expect(String(lastPayment().amount)).toBe('5100.00');
  });

  it('falls back to amount - fees without requested_amount, and accepts merchant-borne fees', async () => {
    const reference = await paystackCheckout();
    providers.paystack.set(reference, { id: 9202, status: 'success', reference, amount: 527767, fees: 17767, currency: 'NGN' });
    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });

    rows('subscription').length = 0;
    const second = await paystackCheckout();
    providers.paystack.set(second, { id: 9203, status: 'success', reference: second, amount: 510000, fees: 7650, currency: 'NGN' });
    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference: second }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });
  });

  it('rejects a wrong requested_amount and logs the amounts without secrets', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reference = await paystackCheckout();
    providers.paystack.set(reference, { id: 9204, status: 'success', reference, amount: 527767, requested_amount: 500000, fees: 27767, currency: 'NGN' });

    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference }, 'req')).resolves.toEqual({ outcome: 'FAILED' });
    expect(rows('subscription')).toHaveLength(0);
    expect(lastPayment().status).toBe('PENDING');
    expect(errors).toHaveBeenCalledWith('[billing] Transaction rejected', expect.objectContaining({
      transactionId: '9204', reason: 'MISMATCH_AMOUNT', expectedMinor: 510000, priceMinor: 500000, chargedMinor: 527767,
    }));
    expect(JSON.stringify(errors.mock.calls)).not.toContain(PAYSTACK_KEY);
    errors.mockRestore();
  });

  it('applies a stuck PENDING payment from the return page after its checkout expired, once', async () => {
    const reference = await paystackCheckout();
    // The checkout link expired long ago; the payment itself was verified.
    lastPayment().checkoutExpiresAt = new Date(Date.now() - 6 * 3_600_000);
    providers.paystack.set(reference, { id: 9205, status: 'success', reference, amount: 527767, requested_amount: 510000, fees: 17767, currency: 'NGN' });

    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });
    await expect(confirmCheckout(ctx, { provider: 'PAYSTACK', reference }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });

    expect(rows('subscription')).toHaveLength(1);
    expect(rows('subscription')[0].currentPeriodEnd).toEqual(addBillingPeriod(PAID_AT));
    expect(rows('trial')[0].status).toBe('CONVERTED');
  });

  it('compares Flutterwave amount, not charged_amount, and requires charged_amount >= amount', async () => {
    await buyWithFlutterwave(821, { amount: 5100, charged_amount: 5171.4, app_fee: 71.4 });
    await expect(confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 821 }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });
    expect(rows('subscription')).toHaveLength(1);

    await buyWithFlutterwave(822, { amount: 5171.4, charged_amount: 5171.4, app_fee: 71.4 });
    await handleFlutterwaveWebhook(flwWebhook(822));
    await buyWithFlutterwave(823, { amount: 5100, charged_amount: 5000 });
    await handleFlutterwaveWebhook(flwWebhook(823));
    expect(rows('billingEvent').map((row) => row.errorCode)).toEqual(['MISMATCH_AMOUNT', 'MISMATCH_AMOUNT']);
  });
});
