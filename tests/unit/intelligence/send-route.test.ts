import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  resolveAccountContext: vi.fn(),
  withinRateLimits: vi.fn(),
}));
const service = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  clientIpFrom: () => '203.0.113.1',
  resolveAccountContext: auth.resolveAccountContext,
  withinRateLimits: auth.withinRateLimits,
}));
vi.mock('../../../apps/web/server/intelligence/service.ts', () => ({ sendMessage: service.sendMessage }));

const { handleSendMessage } = await import('../../../apps/web/server/intelligence/send-route');
const { AppError } = await import('../../../packages/validation/src/errors');

const ORIGIN = 'https://ailaxx.com';
const ctx = { account: { id: 'acct_1' }, user: { id: 'user_1' } };
const body = {
  content: 'Plan my launch',
  capability: 'balanced',
  requestKey: '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90',
};

function post(payload: unknown = body, origin: string | null = ORIGIN, signal?: AbortSignal) {
  return new Request(`${ORIGIN}/api/intelligence/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    signal,
  });
}

async function* events(list: unknown[], onReturn?: () => void) {
  try {
    for (const event of list) yield event;
  } finally {
    onReturn?.();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  auth.withinRateLimits.mockResolvedValue(true);
  auth.resolveAccountContext.mockResolvedValue(ctx);
});

async function errorOf(response: Response) {
  const json = (await response.json()) as { error: { message: string; data: { appCode: string } } };
  return { status: response.status, appCode: json.error.data.appCode, message: json.error.message };
}

describe('POST /api/intelligence/messages', () => {
  it('refuses cross-site and origin-less requests', async () => {
    expect((await errorOf(await handleSendMessage(post(body, 'https://evil.example')))).status).toBe(403);
    expect((await errorOf(await handleSendMessage(post(body, null)))).status).toBe(403);
    expect(service.sendMessage).not.toHaveBeenCalled();
  });

  it('applies the per-IP rate limit', async () => {
    auth.withinRateLimits.mockResolvedValue(false);
    expect(await errorOf(await handleSendMessage(post()))).toMatchObject({ status: 429, appCode: 'RATE_LIMITED' });
  });

  it('validates the body before any account or AI work', async () => {
    expect((await errorOf(await handleSendMessage(post('{not json')))).status).toBe(400);
    const invalid = await errorOf(await handleSendMessage(post({ ...body, content: ' ' })));
    expect(invalid).toMatchObject({ status: 400, message: 'Write a message first.' });
    expect((await errorOf(await handleSendMessage(post({ ...body, model: 'x' })))).status).toBe(400);
    expect(auth.resolveAccountContext).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    auth.resolveAccountContext.mockRejectedValue(new AppError('UNAUTHENTICATED'));
    expect(await errorOf(await handleSendMessage(post()))).toMatchObject({ status: 401, appCode: 'UNAUTHENTICATED' });
  });

  it.each([
    ['TRIAL_EXPIRED', 402],
    ['SUBSCRIPTION_REQUIRED', 402],
    ['RATE_LIMITED', 429],
    ['DEPENDENCY_FAILURE', 503],
    ['NOT_FOUND', 404],
  ] as const)('answers %s with status %i', async (code, status) => {
    service.sendMessage.mockRejectedValue(new AppError(code));
    expect(await errorOf(await handleSendMessage(post()))).toMatchObject({ status, appCode: code });
  });

  it('hides unexpected errors', async () => {
    service.sendMessage.mockRejectedValue(new Error('db password in message'));
    const error = await errorOf(await handleSendMessage(post()));
    expect(error).toMatchObject({ status: 500, appCode: 'INTERNAL_ERROR' });
    expect(error.message).not.toContain('password');
  });

  it('streams events as NDJSON with the session account and the request signal', async () => {
    service.sendMessage.mockResolvedValue(
      events([
        { type: 'start', conversationId: 'c1', title: 'Plan' },
        { type: 'text', text: 'Hi' },
        { type: 'done', messageId: 'm1' },
      ]),
    );
    const request = post();
    const response = await handleSendMessage(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: 'start', conversationId: 'c1', title: 'Plan' },
      { type: 'text', text: 'Hi' },
      { type: 'done', messageId: 'm1' },
    ]);
    const [usedCtx, input, options] = service.sendMessage.mock.calls[0]!;
    expect(usedCtx).toBe(ctx);
    expect(input).toMatchObject({ content: 'Plan my launch', capability: 'balanced', fileIds: [] });
    expect(options.signal).toBe(request.signal);
  });

  it('stops the reply when the client disconnects', async () => {
    const stopped = vi.fn();
    service.sendMessage.mockResolvedValue(
      events([{ type: 'start', conversationId: 'c1', title: 'Plan' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }], stopped),
    );
    const response = await handleSendMessage(post());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(stopped).toHaveBeenCalled();
  });
});
