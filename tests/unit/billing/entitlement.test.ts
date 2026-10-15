import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Subscription state reaches products only through the entitlement service. */

const db = vi.hoisted(() => ({
  trial: { findUnique: vi.fn(), updateMany: vi.fn() },
  subscription: { findFirst: vi.fn() },
  entitlement: { findMany: vi.fn(async () => []) },
  $transaction: vi.fn(),
}));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));

const { resolveEntitlements } = await import('../../../packages/auth/src/entitlements');
const { ENTITLEMENT_KEYS } = await import('../../../packages/auth/src/policies');

const ctx = {
  user: { id: 'user_1', email: 'a@example.com', name: null, role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date(Date.now() + 3_600_000) },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.trial.findUnique.mockResolvedValue({
    id: 'trial_1',
    status: 'CONVERTED',
    startedAt: new Date(Date.now() - 3_600_000),
    expiresAt: new Date(Date.now() + 3_600_000),
    endedAt: new Date(),
  });
});

describe('subscription → entitlements', () => {
  it('grants every key with an active, paid-up Aila Pro subscription', async () => {
    db.subscription.findFirst.mockResolvedValue({ id: 'sub_1' });
    const resolution = await resolveEntitlements(ctx);

    expect(resolution.proAccess).toEqual({ allowed: true, source: 'SUBSCRIPTION' });
    expect(resolution.keys).toEqual([...ENTITLEMENT_KEYS]);

    const [{ where }] = db.subscription.findFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ accountId: 'acct_1', plan: 'AILA_PRO', status: 'ACTIVE' });
    expect(where.OR).toEqual([{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: expect.any(Date) } }]);
  });

  it('grants nothing once the subscription is no longer active (past due, cancelled, ended)', async () => {
    db.subscription.findFirst.mockResolvedValue(null);
    const resolution = await resolveEntitlements(ctx);

    expect(resolution.proAccess.allowed).toBe(false);
    expect(resolution.keys).toEqual([]);
  });
});
