import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ resolveAccountContext: vi.fn(), withinRateLimits: vi.fn() }));
const service = vi.hoisted(() => ({ assist: vi.fn() }));

vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  clientIpFrom: () => '203.0.113.1',
  resolveAccountContext: auth.resolveAccountContext,
  withinRateLimits: auth.withinRateLimits,
}));
vi.mock('../../../apps/web/server/writer/assist.ts', () => ({ assist: service.assist }));

const { handleAssist } = await import('../../../apps/web/server/writer/assist-route');
const { AppError } = await import('../../../packages/validation/src/errors');

const ORIGIN = 'https://ailaxx.com';
const ctx = { account: { id: 'acct_1' }, user: { id: 'user_1' } };
const body = {
  nodeId: '01926f0e-8a5b-7c3d-9e2f-1a2b3c4d5e6f',
  operation: 'improve',
  selection: 'The rain came early.',
  requestKey: '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90',
};

function post(payload: unknown = body, origin: string | null = ORIGIN, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/writer/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

async function* events(list: unknown[], onReturn?: () => void) {
  try {
    for (const event of list) yield event;
  } finally {
    onReturn?.();
  }
}

async function errorOf(response: Response) {
  const json = (await response.json()) as { error: { message: string; data: { appCode: string } } };
  return { status: response.status, appCode: json.error.data.appCode, message: json.error.message };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  auth.withinRateLimits.mockResolvedValue(true);
  auth.resolveAccountContext.mockResolvedValue(ctx);
});

describe('POST /api/writer/assist', () => {
  it('refuses cross-site and origin-less requests', async () => {
    expect((await errorOf(await handleAssist(post(body, 'https://evil.example')))).status).toBe(403);
    expect((await errorOf(await handleAssist(post(body, null)))).status).toBe(403);
    expect(service.assist).not.toHaveBeenCalled();
  });

  it('applies the per-IP rate limit', async () => {
    auth.withinRateLimits.mockResolvedValue(false);
    expect(await errorOf(await handleAssist(post()))).toMatchObject({ status: 429, appCode: 'RATE_LIMITED' });
  });

  it('refuses oversized bodies', async () => {
    const large = { ...body, selection: 'x'.repeat(300 * 1024) };
    expect((await errorOf(await handleAssist(post(large)))).status).toBe(400);
    expect((await errorOf(await handleAssist(post(body, ORIGIN, { 'Content-Length': String(400 * 1024) })))).status).toBe(400);
    expect(service.assist).not.toHaveBeenCalled();
  });

  it('validates the body before any account or AI work', async () => {
    expect((await errorOf(await handleAssist(post('{not json')))).status).toBe(400);
    const missing = await errorOf(await handleAssist(post({ ...body, selection: '' })));
    expect(missing).toMatchObject({ status: 400, message: 'Select the text you want Aila to work on.' });
    expect((await errorOf(await handleAssist(post({ ...body, model: 'x' })))).status).toBe(400);
    expect((await errorOf(await handleAssist(post({ ...body, accountId: 'acct_2' })))).status).toBe(400);
    expect(auth.resolveAccountContext).not.toHaveBeenCalled();
  });

  it('requires a session and reports access errors', async () => {
    auth.resolveAccountContext.mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    expect(await errorOf(await handleAssist(post()))).toMatchObject({ status: 401, appCode: 'UNAUTHENTICATED' });
    service.assist.mockRejectedValueOnce(new AppError('TRIAL_EXPIRED'));
    expect(await errorOf(await handleAssist(post()))).toMatchObject({ status: 402, appCode: 'TRIAL_EXPIRED' });
    service.assist.mockRejectedValueOnce(new AppError('NOT_FOUND'));
    expect(await errorOf(await handleAssist(post()))).toMatchObject({ status: 404 });
  });

  it('hides unexpected errors', async () => {
    service.assist.mockRejectedValue(new Error('secret detail'));
    const error = await errorOf(await handleAssist(post()));
    expect(error).toMatchObject({ status: 500, appCode: 'INTERNAL_ERROR' });
    expect(error.message).not.toContain('secret');
  });

  it('streams NDJSON with the session account and stops when the client leaves', async () => {
    const stopped = vi.fn();
    service.assist.mockResolvedValue(
      events([{ type: 'text', text: 'Better ' }, { type: 'text', text: 'text.' }, { type: 'done', webSearch: 'not_requested', sources: [] }], stopped),
    );
    const response = await handleAssist(post());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const lines = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines.map((line) => line.type)).toEqual(['text', 'text', 'done']);
    const [usedCtx, input] = service.assist.mock.calls[0]!;
    expect(usedCtx).toBe(ctx);
    expect(input).toMatchObject({ operation: 'improve', capability: 'balanced', webSearch: 'off', fileIds: [] });

    service.assist.mockResolvedValue(events([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], stopped));
    const reader = (await handleAssist(post())).body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(stopped).toHaveBeenCalled();
  });
});
