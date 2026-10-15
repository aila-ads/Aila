import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * End-to-end webhook and checkout-return behaviour against an in-memory
 * database and a mocked Flutterwave API (AC-160-163).
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];

    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as Record<string, unknown>;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('not' in c) return value !== c.not && value !== undefined;
      if ('gt' in c) return value instanceof Date && value.getTime() > (c.gt as Date).getTime();
      return false;
    }

    return value === condition;
  });
}

function table(name: string, unique: string[][] = [], defaults: Row = {}) {
  const rows: Row[] = [];
  let next = 1;

  const conflict = (candidate: Row, self?: Row) =>
    unique.some((keys) =>
      rows.some(
        (row) =>
          row !== self &&
          keys.every((key) => candidate[key] !== null && candidate[key] !== undefined && row[key] === candidate[key]),
      ),
    );
  const uniqueError = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const sorted = (orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return rows;
    const [[key, direction]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const av = (a[key] as Date | null)?.getTime?.() ?? 0;
      const bv = (b[key] as Date | null)?.getTime?.() ?? 0;
      return direction === 'asc' ? av - bv : bv - av;
    });
  };

  return {
    rows,
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row: Row = { id: `${name}_${next++}`, createdAt: new Date(Date.now() + next), ...defaults, ...data };
      if (typeof row.amount === 'string') {
        // Prisma returns Decimal columns as Decimal objects.
        const value = row.amount;
        row.amount = { toFixed: (digits: number) => Number(value).toFixed(digits), toString: () => value };
      }
      if (conflict(row)) throw uniqueError();
      rows.push(row);
      return row;
    }),
    findFirst: vi.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) =>
      sorted(orderBy).find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where?: Where }) => rows.filter((row) => matches(row, where))),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: Record<string, Where> }) => {
      const [criteria] = Object.values(where);
      const row = rows.find((candidate) => matches(candidate, criteria));
      if (!row) throw new Error('not found');
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    }),
  };
}

const db = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof table>> & { $transaction: unknown });

function resetDb() {
  Object.assign(db, {
    // Column defaults as in prisma/schema.prisma.
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
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }),
    billingEvent: table('event', [['provider', 'providerEventId']], { processedAt: null, errorCode: null }),
    trial: table('trial'),
    auditLog: table('audit'),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    $queryRaw: async () => [],
  });
}

const auth = vi.hoisted(() => ({ withinRateLimits: vi.fn(async () => true) }));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  auditLogData: (event: Row) => event,
  authorize: (allowed: boolean) => {
    if (!allowed) throw new Error('FORBIDDEN');
  },
  isAccountOwner: (ctx: { membership: { role: string } }) => ctx.membership.role === 'OWNER',
  recordAuditEvent: async (event: Row) => {
    db.auditLog.rows.push(event);
  },
  withinRateLimits: auth.withinRateLimits,
}));

const { handleFlutterwaveWebhook } = await import('../../../packages/billing/src/handler');
const { confirmCheckout, cancelSubscription, startCheckout } = await import(
  '../../../packages/billing/src/service'
);

const SECRET = 'a'.repeat(64);
const PLAN_ID = 4242;
const PAID_AT = new Date(Date.now() - 60_000);

const ctx = {
  user: { id: 'user_1', email: 'owner@example.com', name: 'Owner', role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date(Date.now() + 3_600_000) },
};

type Tx = { id: number; tx_ref: string; amount: number; currency: string; status: string };

const flutterwave = {
  plan: { id: PLAN_ID, amount: 20, currency: 'USD', interval: 'monthly', status: 'active' },
  transactions: new Map<number, Tx>(),
  subscriptions: [] as Array<{ id: number; plan: number; status: string; customer: { id: number; customer_email: string }; transaction: number }>,
  cancelled: [] as string[],
};

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const ok = (data: unknown) => Response.json({ status: 'success', message: 'ok', data });
  const path = url.pathname.replace('/v3', '');

  if (path === `/payment-plans/${PLAN_ID}`) return ok(flutterwave.plan);
  if (path === '/payments' && init?.method === 'POST') return ok({ link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc' });

  const verify = path.match(/^\/transactions\/(\d+)\/verify$/);
  if (verify) {
    const tx = flutterwave.transactions.get(Number(verify[1]));
    return tx
      ? ok({ ...tx, created_at: PAID_AT.toISOString(), customer: { id: 9, email: 'owner@example.com' } })
      : Response.json({ status: 'error', message: 'No transaction was found for this id' }, { status: 400 });
  }

  if (path === '/subscriptions') {
    const transactionId = url.searchParams.get('transaction_id');
    const status = url.searchParams.get('status');
    const data = flutterwave.subscriptions.filter(
      (s) => (!transactionId || String(s.transaction) === transactionId) && (!status || s.status === status),
    );
    return Response.json({ status: 'success', meta: { page_info: { total_pages: 1 } }, data });
  }

  const cancel = path.match(/^\/subscriptions\/(\d+)\/cancel$/);
  if (cancel && init?.method === 'PUT') {
    flutterwave.cancelled.push(cancel[1]);
    const s = flutterwave.subscriptions.find((item) => String(item.id) === cancel[1]);
    if (s) s.status = 'cancelled';
    return ok({ id: Number(cancel[1]), status: 'cancelled' });
  }

  return new Response('not found', { status: 404 });
});

function webhook(body: unknown, hash: string | null = SECRET): Request {
  return new Request('https://ailaxx.com/api/webhooks/flutterwave', {
    method: 'POST',
    headers: hash === null ? {} : { 'verif-hash': hash, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function openCheckout(): Promise<{ txRef: string }> {
  await startCheckout(ctx, 'FLUTTERWAVE_CARD_PLAN', 'req');
  const payment = db.payment.rows.at(-1)!;
  return { txRef: payment.txRef as string };
}

function pay(id: number, txRef: string, overrides: Partial<Tx> = {}) {
  flutterwave.transactions.set(id, { id, tx_ref: txRef, amount: 20, currency: 'USD', status: 'successful', ...overrides });
  flutterwave.subscriptions.push({ id: 7000 + id, plan: PLAN_ID, status: 'active', customer: { id: 9, customer_email: 'owner@example.com' }, transaction: id });
}

beforeEach(() => {
  resetDb();
  flutterwave.transactions.clear();
  flutterwave.subscriptions = [];
  flutterwave.cancelled = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('FLUTTERWAVE_SECRET_KEY', 'FLWSECK-live-X');
  vi.stubEnv('FLUTTERWAVE_WEBHOOK_SECRET_HASH', SECRET);
  vi.stubEnv('FLUTTERWAVE_PRO_PLAN_ID', String(PLAN_ID));
  db.trial.rows.push({ id: 'trial_1', accountId: 'acct_1', status: 'ACTIVE' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('webhook authentication (AC-161)', () => {
  it('rejects a forged or missing verif-hash without touching the database or Flutterwave', async () => {
    expect((await handleFlutterwaveWebhook(webhook({ event: 'charge.completed', data: { id: 1, status: 'successful' } }, 'b'.repeat(64)))).status).toBe(401);
    expect((await handleFlutterwaveWebhook(webhook({ event: 'charge.completed', data: { id: 1, status: 'successful' } }, null))).status).toBe(401);
    expect(db.billingEvent.rows).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads', async () => {
    expect((await handleFlutterwaveWebhook(webhook('{not json'))).status).toBe(400);
    expect((await handleFlutterwaveWebhook(webhook({ event: 'charge.completed', data: {} }))).status).toBe(400);
    expect(db.billingEvent.rows).toHaveLength(0);
  });

  it('fails closed with 500 when the secret hash is not configured', async () => {
    vi.stubEnv('FLUTTERWAVE_WEBHOOK_SECRET_HASH', '');
    expect((await handleFlutterwaveWebhook(webhook({ event: 'x', data: {} }))).status).toBe(500);
  });
});

describe('checkout and activation (AC-160)', () => {
  it('creates the checkout from the plan price, never from the client', async () => {
    const { url } = await startCheckout(ctx, 'FLUTTERWAVE_CARD_PLAN', 'req');
    expect(url).toBe('https://checkout.flutterwave.com/v3/hosted/pay/abc');

    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/payments'))!;
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      amount: 20,
      currency: 'USD',
      payment_plan: PLAN_ID,
      redirect_url: 'https://ailaxx.com/billing',
      customer: { email: 'owner@example.com' },
    });
    expect(db.payment.rows[0]).toMatchObject({ status: 'PENDING', currency: 'USD' });
    expect(String(db.payment.rows[0].amount)).toBe('20.00');
  });

  it('reuses the open checkout instead of starting a second one', async () => {
    await startCheckout(ctx, 'FLUTTERWAVE_CARD_PLAN', 'req');
    await startCheckout(ctx, 'FLUTTERWAVE_CARD_PLAN', 'req');
    expect(db.payment.rows).toHaveLength(1);
  });

  it('activates Aila Pro from a verified webhook and converts the trial', async () => {
    const { txRef } = await openCheckout();
    pay(501, txRef);

    const response = await handleFlutterwaveWebhook(
      webhook({ event: 'charge.completed', data: { id: 501, status: 'successful', amount: 1 } }),
    );

    expect(response.status).toBe(200);
    expect(db.subscription.rows).toHaveLength(1);
    expect(db.subscription.rows[0]).toMatchObject({
      accountId: 'acct_1',
      status: 'ACTIVE',
      providerSubscriptionId: '7501',
      providerCustomerId: '9',
      currentPeriodStart: PAID_AT,
    });
    expect((db.subscription.rows[0].currentPeriodEnd as Date).getTime()).toBeGreaterThan(Date.now());
    expect(db.payment.rows[0]).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: '501' });
    expect(db.trial.rows[0].status).toBe('CONVERTED');
    expect(db.billingEvent.rows[0]).toMatchObject({ processedAt: expect.any(Date), errorCode: null });
    expect(db.auditLog.rows.some((row) => (row.metadata as Row)?.event === 'SUBSCRIPTION_ACTIVATED')).toBe(true);
  });

  it('activates from the checkout return after verifying with Flutterwave', async () => {
    const { txRef } = await openCheckout();
    pay(502, txRef);
    await expect(confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 502 }, 'req')).resolves.toEqual({ outcome: 'ACTIVE' });
    expect(db.subscription.rows).toHaveLength(1);
  });

  it('refuses a transaction that belongs to another account', async () => {
    const { txRef } = await openCheckout();
    pay(503, txRef);
    const other = { ...ctx, account: { id: 'acct_2' } };
    await expect(confirmCheckout(other, { provider: 'FLUTTERWAVE', transactionId: 503 }, 'req')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(db.subscription.rows).toHaveLength(0);
  });

  it('never activates on a wrong amount or currency', async () => {
    const { txRef } = await openCheckout();
    pay(504, txRef, { amount: 1 });
    pay(505, txRef, { currency: 'NGN', amount: 20 });

    for (const id of [504, 505]) {
      const response = await handleFlutterwaveWebhook(
        webhook({ event: 'charge.completed', data: { id, status: 'successful' } }),
      );
      expect(response.status).toBe(200);
    }

    expect(db.subscription.rows).toHaveLength(0);
    expect(db.payment.rows[0].status).toBe('PENDING');
    expect(db.billingEvent.rows.map((row) => row.errorCode)).toEqual(['MISMATCH_AMOUNT', 'MISMATCH_CURRENCY']);
  });

  it('ignores a forged charge Flutterwave does not know', async () => {
    const response = await handleFlutterwaveWebhook(
      webhook({ event: 'charge.completed', data: { id: 999, status: 'successful' } }),
    );
    expect(response.status).toBe(200);
    expect(db.subscription.rows).toHaveLength(0);
    expect(db.billingEvent.rows[0].errorCode).toBe('TRANSACTION_NOT_FOUND');
  });

  it('asks Flutterwave to retry when the plan subscription is not linked yet', async () => {
    const { txRef } = await openCheckout();
    flutterwave.transactions.set(506, { id: 506, tx_ref: txRef, amount: 20, currency: 'USD', status: 'successful' });

    const response = await handleFlutterwaveWebhook(
      webhook({ event: 'charge.completed', data: { id: 506, status: 'successful' } }),
    );
    expect(response.status).toBe(500);
    expect(db.payment.rows[0].status).toBe('PENDING');
    expect(db.billingEvent.rows[0]).toMatchObject({ processedAt: null, errorCode: 'SUBSCRIPTION_NOT_LINKED' });
  });
});

describe('idempotency (AC-162)', () => {
  it('applies a duplicate webhook delivery once', async () => {
    const { txRef } = await openCheckout();
    pay(601, txRef);
    const event = { event: 'charge.completed', data: { id: 601, status: 'successful' } };

    expect((await handleFlutterwaveWebhook(webhook(event))).status).toBe(200);
    const calls = fetchMock.mock.calls.length;
    expect((await handleFlutterwaveWebhook(webhook(event))).status).toBe(200);

    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(db.billingEvent.rows).toHaveLength(1);
    expect(db.subscription.rows).toHaveLength(1);
  });

  it('does not double-apply when the return page and the webhook both confirm', async () => {
    const { txRef } = await openCheckout();
    pay(602, txRef);

    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 602 }, 'req');
    await handleFlutterwaveWebhook(webhook({ event: 'charge.completed', data: { id: 602, status: 'successful' } }));
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 602 }, 'req');

    expect(db.subscription.rows).toHaveLength(1);
    expect(db.payment.rows.filter((row) => row.status === 'SUCCEEDED')).toHaveLength(1);
  });

  it('extends the period once per renewal charge', async () => {
    const { txRef } = await openCheckout();
    pay(603, txRef);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: 603 }, 'req');
    const firstEnd = db.subscription.rows[0].currentPeriodEnd as Date;

    flutterwave.transactions.set(604, { id: 604, tx_ref: 'flw-renewal-604', amount: 20, currency: 'USD', status: 'successful' });
    const renewal = { event: 'charge.completed', data: { id: 604, status: 'successful' } };
    await handleFlutterwaveWebhook(webhook(renewal));
    // A redelivery whose event record was lost still cannot extend twice.
    db.billingEvent.rows.length = 0;
    await handleFlutterwaveWebhook(webhook(renewal));

    const end = db.subscription.rows[0].currentPeriodEnd as Date;
    expect(end.getTime()).toBeGreaterThan(firstEnd.getTime());
    expect(db.subscription.rows[0].currentPeriodStart).toEqual(firstEnd);
    expect(db.payment.rows.filter((row) => row.providerTransactionId === '604')).toHaveLength(1);
  });
});

describe('renewal failure and cancellation (AC-163)', () => {
  async function activate(id: number) {
    const { txRef } = await openCheckout();
    pay(id, txRef);
    await confirmCheckout(ctx, { provider: 'FLUTTERWAVE', transactionId: id }, 'req');
    return db.subscription.rows[0];
  }

  it('marks PAST_DUE on a failed renewal and ACTIVE again on a successful retry', async () => {
    const subscription = await activate(701);
    // The paid period has ended and Flutterwave charges the renewal.
    subscription.currentPeriodStart = new Date(Date.now() - 40 * 86_400_000);
    subscription.currentPeriodEnd = new Date(Date.now() - 120_000);

    flutterwave.transactions.set(702, { id: 702, tx_ref: 'flw-702', amount: 20, currency: 'USD', status: 'failed' });
    await handleFlutterwaveWebhook(webhook({ event: 'charge.completed', data: { id: 702, status: 'failed' } }));
    expect(subscription.status).toBe('PAST_DUE');

    flutterwave.transactions.set(703, { id: 703, tx_ref: 'flw-703', amount: 20, currency: 'USD', status: 'successful' });
    await handleFlutterwaveWebhook(webhook({ event: 'charge.completed', data: { id: 703, status: 'successful' } }));
    expect(subscription.status).toBe('ACTIVE');
    expect((subscription.currentPeriodEnd as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('cancels at Flutterwave and keeps access until the period ends', async () => {
    const subscription = await activate(711);
    await cancelSubscription(ctx, 'req');

    expect(flutterwave.cancelled).toEqual(['7711']);
    expect(subscription).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true, canceledAt: expect.any(Date) });

    // Flutterwave's own cancellation webhook then changes nothing more.
    const audits = db.auditLog.rows.length;
    const response = await handleFlutterwaveWebhook(
      webhook({
        event: 'subscription.cancelled',
        data: { status: 'deactivated', customer: { email: 'owner@example.com' }, plan: { id: PLAN_ID } },
      }),
    );
    expect(response.status).toBe(200);
    expect(db.auditLog.rows.length).toBe(audits);
  });

  it('reflects a cancellation made at Flutterwave', async () => {
    const subscription = await activate(721);
    flutterwave.subscriptions[0].status = 'cancelled';

    await handleFlutterwaveWebhook(
      webhook({
        event: 'subscription.cancelled',
        data: { status: 'deactivated', customer: { email: 'owner@example.com' }, plan: { id: PLAN_ID } },
      }),
    );

    expect(subscription).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true });
  });

  it('only lets the account owner start a checkout or cancel', async () => {
    const member = { ...ctx, membership: { role: 'MEMBER' as const } };
    await expect(startCheckout(member, 'FLUTTERWAVE_CARD_PLAN', 'req')).rejects.toThrow('FORBIDDEN');
    await expect(cancelSubscription(member, 'req')).rejects.toThrow('FORBIDDEN');
  });

  it('refuses a second checkout while Aila Pro is active', async () => {
    await activate(731);
    await expect(startCheckout(ctx, 'FLUTTERWAVE_CARD_PLAN', 'req')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
