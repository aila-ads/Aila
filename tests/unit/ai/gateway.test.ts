import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  usageRecord: {
    count: vi.fn(),
    aggregate: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  trial: { findUnique: vi.fn() },
}));

const auth = vi.hoisted(() => ({
  requireEntitlement: vi.fn(),
  withinRateLimits: vi.fn(),
}));

vi.mock('../../../packages/db/src/index.ts', () => ({ getDb: () => db }));
vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  PRODUCT_ENTITLEMENT_KEYS: ['intelligence', 'writer', 'translate', 'ads', 'legal', 'coding'],
  accountScope: (ctx: { account: { id: string } }) => ({ accountId: ctx.account.id }),
  requireEntitlement: auth.requireEntitlement,
  withinRateLimits: auth.withinRateLimits,
}));

const { generate, stream } = await import('../../../packages/ai/src/gateway');
const { AppError } = await import('../../../packages/validation/src/errors');

const ctx = {
  user: { id: 'user_1', email: 'a@example.com', name: null, role: 'USER' as const },
  account: { id: 'acct_1' },
  membership: { role: 'OWNER' as const },
  session: { id: 'sess_1', expiresAt: new Date('2026-10-10T00:00:00.000Z') },
};

const ALL_KEYS = ['intelligence', 'writer', 'translate', 'ads', 'legal', 'coding', 'file_upload', 'projects', 'advanced_models'];
const PROMPT = 'Private business plan text';
const ANSWER = 'Confidential answer text';

const request = {
  product: 'intelligence' as const,
  capability: 'balanced' as const,
  messages: [{ role: 'user' as const, content: PROMPT }],
};

const fetchMock = vi.fn<typeof fetch>();

function completion(content = ANSWER): Response {
  return Response.json({
    model: 'deepseek/deepseek-chat-v3.1',
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, cost: 0.00002 },
  });
}

function sse(lines: string[], keepOpen = false): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        if (!keepOpen) controller.close();
      },
    }),
    { status: 200 },
  );
}

function usage({ requests = 0, tokens = 0 } = {}) {
  db.usageRecord.count.mockResolvedValue(requests);
  db.usageRecord.aggregate.mockResolvedValue({ _sum: { totalTokens: tokens } });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  auth.requireEntitlement.mockResolvedValue({ keys: ALL_KEYS, proAccess: { allowed: true, source: 'SUBSCRIPTION' } });
  auth.withinRateLimits.mockResolvedValue(true);
  db.trial.findUnique.mockResolvedValue({ startedAt: new Date() });
  db.usageRecord.findFirst.mockResolvedValue(null);
  db.usageRecord.create.mockResolvedValue({});
  usage();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Object.values(db.usageRecord).forEach((fn) => fn.mockReset());
  db.trial.findUnique.mockReset();
  auth.requireEntitlement.mockReset();
  auth.withinRateLimits.mockReset();
});

const logged = () =>
  JSON.stringify([
    ...vi.mocked(console.info).mock.calls,
    ...vi.mocked(console.error).mock.calls,
  ]);

describe('generate', () => {
  it('checks the entitlement, calls the provider and records usage without any text', async () => {
    fetchMock.mockResolvedValue(completion());

    const result = await generate(ctx, request, { requestId: 'req_1' });

    expect(result.content).toBe(ANSWER);
    expect(auth.requireEntitlement).toHaveBeenCalledWith(ctx, 'intelligence', 'req_1');
    expect(auth.withinRateLimits).toHaveBeenCalledWith([['aiRequestPerAccount', 'acct_1']]);
    expect(db.usageRecord.create).toHaveBeenCalledTimes(1);

    const data = db.usageRecord.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      accountId: 'acct_1',
      userId: 'user_1',
      product: 'INTELLIGENCE',
      usageType: 'AI_REQUEST',
      operation: 'balanced',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1',
      requestId: 'req_1',
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      estimatedCost: 0.00002,
      currency: 'USD',
      status: 'SUCCESS',
    });
    expect(typeof data.durationMs).toBe('number');
    expect(JSON.stringify(data)).not.toContain(PROMPT);
    expect(JSON.stringify(data)).not.toContain(ANSWER);
    expect(logged()).not.toContain(PROMPT);
    expect(logged()).not.toContain(ANSWER);
    expect(logged()).not.toContain('test-key');
  });

  it('chooses the model on the server and ignores anything else the caller sends', async () => {
    fetchMock.mockResolvedValue(completion());
    const sneaky = { ...request, model: 'openai/gpt-5', accountId: 'acct_other', maxTokens: 999_999 };

    await generate(ctx, sneaky as typeof request, { requestId: 'req_1' });

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe('deepseek/deepseek-chat-v3.1');
    expect(body.models).toEqual(['deepseek/deepseek-chat-v3.1', 'google/gemini-3.8-flash']);
    expect(body.max_tokens).toBe(4096);
    expect(db.usageRecord.create.mock.calls[0]![0].data.accountId).toBe('acct_1');
  });

  it('stops before the provider when the entitlement is missing', async () => {
    auth.requireEntitlement.mockRejectedValue(new AppError('TRIAL_EXPIRED'));
    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({ code: 'TRIAL_EXPIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires advanced_models for the reasoning capability', async () => {
    auth.requireEntitlement.mockResolvedValue({
      keys: ['intelligence'],
      proAccess: { allowed: false, reason: 'SUBSCRIPTION_REQUIRED' },
    });
    await expect(
      generate(ctx, { ...request, capability: 'reasoning' }, { requestId: 'r' }),
    ).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED', reason: 'AI_MODEL_NOT_INCLUDED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops when the account is rate limited', async () => {
    auth.withinRateLimits.mockResolvedValue(false);
    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({ code: 'RATE_LIMITED', reason: 'AI_RATE_LIMITED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces the trial allowance counted from the trial start', async () => {
    const startedAt = new Date('2026-10-09T08:00:00.000Z');
    auth.requireEntitlement.mockResolvedValue({ keys: ALL_KEYS, proAccess: { allowed: true, source: 'TRIAL' } });
    db.trial.findUnique.mockResolvedValue({ startedAt });
    usage({ requests: 30 });

    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      reason: 'AI_USAGE_LIMIT_REACHED',
    });
    expect(db.usageRecord.count.mock.calls[0]![0].where).toMatchObject({
      accountId: 'acct_1',
      usageType: 'AI_REQUEST',
      createdAt: { gte: startedAt },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces the Pro token allowance', async () => {
    usage({ requests: 10, tokens: 2_000_000 });
    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({ reason: 'AI_USAGE_LIMIT_REACHED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid or oversized input before the provider', async () => {
    const bad = [
      { ...request, messages: [] },
      { ...request, messages: [{ role: 'assistant' as const, content: 'hi' }] },
      { ...request, messages: [{ role: 'user' as const, content: '   ' }] },
      { ...request, capability: 'vision' as never },
      { ...request, product: 'file_upload' as never },
    ];
    for (const input of bad) {
      await expect(generate(ctx, input, { requestId: 'r' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    await expect(
      generate(ctx, { ...request, messages: [{ role: 'user', content: 'x'.repeat(120_001) }] }, { requestId: 'r' }),
    ).rejects.toMatchObject({ reason: 'AI_CONTEXT_TOO_LARGE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a repeated idempotency key', async () => {
    db.usageRecord.findFirst.mockResolvedValue({ id: 'u1' });
    await expect(
      generate(ctx, { ...request, idempotencyKey: 'msg_1' }, { requestId: 'r' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', reason: 'AI_DUPLICATE_REQUEST' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a transient failure once, then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(completion());
    const result = await generate(ctx, request, { requestId: 'r' });
    expect(result.content).toBe(ANSWER);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.usageRecord.create.mock.calls[0]![0].data.metadata).toMatchObject({ attempts: 2 });
  });

  it('gives up after one retry and records the failure', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 502 }));
    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({
      code: 'DEPENDENCY_FAILURE',
      reason: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.usageRecord.create.mock.calls[0]![0].data).toMatchObject({
      status: 'FAILURE',
      totalTokens: 0,
      metadata: { errorCode: 'AI_PROVIDER_UNAVAILABLE' },
    });
  });

  it('does not retry a permanent failure', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: 400, message: 'bad' } }, { status: 400 }));
    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({ reason: 'AI_INVALID_REQUEST' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails cleanly without a key and never crashes on import', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(generate(ctx, request, { requestId: 'r' })).rejects.toMatchObject({
      code: 'DEPENDENCY_FAILURE',
      reason: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a cancelled request when the client disconnects', async () => {
    const client = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    const pending = generate(ctx, request, { requestId: 'r', signal: client.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    client.abort();

    await expect(pending).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.usageRecord.create.mock.calls[0]![0].data.status).toBe('CANCELLED');
  });
});

describe('stream', () => {
  it('streams text and records usage at the end', async () => {
    fetchMock.mockResolvedValue(
      sse([
        'data: {"model":"deepseek/deepseek-chat-v3.1","choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const events = [];
    for await (const event of await stream(ctx, request, { requestId: 'r' })) events.push(event);

    expect(events.at(0)).toEqual({ type: 'text', text: 'Hi' });
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'deepseek/deepseek-chat-v3.1' });
    expect(db.usageRecord.create.mock.calls[0]![0].data).toMatchObject({ status: 'SUCCESS', totalTokens: 6 });
  });

  it('cancels the provider and records the cancellation when the consumer stops', async () => {
    fetchMock.mockResolvedValue(sse(['data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'], true));
    const signal = () => fetchMock.mock.calls[0]![1]!.signal!;

    for await (const event of await stream(ctx, request, { requestId: 'r' })) {
      expect(event).toEqual({ type: 'text', text: 'Hello' });
      break;
    }

    expect(signal().aborted).toBe(true);
    expect(db.usageRecord.create.mock.calls[0]![0].data).toMatchObject({ status: 'CANCELLED' });
    expect(db.usageRecord.create.mock.calls[0]![0].data.outputTokens).toBeGreaterThan(0);
  });

  it('throws before streaming when the provider refuses the request', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: 401 } }, { status: 401 }));
    await expect(stream(ctx, request, { requestId: 'r' })).rejects.toMatchObject({
      code: 'DEPENDENCY_FAILURE',
      reason: 'AI_AUTHENTICATION_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
