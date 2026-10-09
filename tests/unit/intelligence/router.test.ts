import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ resolveAccountContext: vi.fn(), withinRateLimits: vi.fn() }));
const service = vi.hoisted(() => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  resolveAccountContext: auth.resolveAccountContext,
  withinRateLimits: auth.withinRateLimits,
}));
vi.mock('../../../apps/web/server/intelligence/service.ts', () => service);

const { createTRPCRouter } = await import('../../../apps/web/server/api/trpc');
const { intelligenceRouter } = await import('../../../apps/web/server/api/routers/intelligence');
const { AppError } = await import('../../../packages/validation/src/errors');

const router = createTRPCRouter({ intelligence: intelligenceRouter });
const ctx = { account: { id: 'acct_1' }, user: { id: 'user_1' } };

function caller(resolveAccount = () => Promise.resolve(ctx)) {
  return router.createCaller({ requestId: 'req_1', resolveAccount: resolveAccount as never });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.withinRateLimits.mockResolvedValue(true);
});

describe('intelligence router', () => {
  it('requires a signed-in account for every procedure', async () => {
    const signedOut = caller(() => Promise.reject(new AppError('UNAUTHENTICATED')));
    await expect(signedOut.intelligence.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(signedOut.intelligence.get({ conversationId: 'c1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(signedOut.intelligence.rename({ conversationId: 'c1', title: 'T' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(signedOut.intelligence.delete({ conversationId: 'c1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(service.listConversations).not.toHaveBeenCalled();
  });

  it('passes the session account, never client input, to the service', async () => {
    service.listConversations.mockResolvedValue([]);
    service.getConversation.mockResolvedValue({ id: 'c1' });
    await caller().intelligence.list();
    await caller().intelligence.get({ conversationId: 'c1' });
    expect(service.listConversations).toHaveBeenCalledWith(ctx);
    expect(service.getConversation).toHaveBeenCalledWith(ctx, 'c1');
  });

  it('rejects an account id in the input', async () => {
    await expect(
      caller().intelligence.get({ conversationId: 'c1', accountId: 'acct_2' } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('maps a missing conversation to NOT_FOUND', async () => {
    service.getConversation.mockRejectedValue(new AppError('NOT_FOUND'));
    await expect(caller().intelligence.get({ conversationId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rate-limits renames and deletes per account', async () => {
    auth.withinRateLimits.mockResolvedValue(false);
    await expect(caller().intelligence.delete({ conversationId: 'c1' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(service.deleteConversation).not.toHaveBeenCalled();
  });

  it('renames with a cleaned title and the request id', async () => {
    service.renameConversation.mockResolvedValue({ id: 'c1', title: 'Q4 plan' });
    await caller().intelligence.rename({ conversationId: 'c1', title: '  Q4   plan ' });
    expect(service.renameConversation).toHaveBeenCalledWith(ctx, { conversationId: 'c1', title: 'Q4 plan' }, 'req_1');
  });
});
