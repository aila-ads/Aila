import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, toAppError } from '../../../packages/ai/src/errors';
import { normalizeError, openRouter } from '../../../packages/ai/src/providers/openrouter';

const request = (signal = new AbortController().signal) => ({
  models: ['google/gemini-3.8-flash', 'deepseek/deepseek-chat-v3.1'],
  messages: [{ role: 'user' as const, content: 'Hello' }],
  maxOutputTokens: 1000,
  signal,
});

function sse(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

describe('normalizeError', () => {
  it.each([
    [400, 'bad input', 'AI_INVALID_REQUEST', false],
    [400, 'maximum context length exceeded', 'AI_CONTEXT_TOO_LARGE', false],
    [401, undefined, 'AI_AUTHENTICATION_ERROR', false],
    [402, undefined, 'AI_PROVIDER_UNAVAILABLE', false],
    [403, undefined, 'AI_CONTENT_RESTRICTED', false],
    [404, undefined, 'AI_MODEL_UNAVAILABLE', false],
    [408, undefined, 'AI_TIMEOUT', false],
    [429, undefined, 'AI_RATE_LIMITED', true],
    [500, undefined, 'AI_PROVIDER_UNAVAILABLE', true],
    [502, undefined, 'AI_PROVIDER_UNAVAILABLE', true],
    [503, undefined, 'AI_PROVIDER_UNAVAILABLE', true],
  ])('maps %i to %s', (status, message, code, retryable) => {
    const error = normalizeError(status, { message });
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(error.status).toBe(status);
  });

  it('becomes an application error that carries the AI code as the reason', () => {
    expect(toAppError(new AiError('AI_RATE_LIMITED'))).toMatchObject({ code: 'RATE_LIMITED', reason: 'AI_RATE_LIMITED' });
    expect(toAppError(new AiError('AI_TIMEOUT'))).toMatchObject({ code: 'DEPENDENCY_FAILURE', reason: 'AI_TIMEOUT' });
    expect(toAppError(new AiError('AI_CONTEXT_TOO_LARGE'))).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(toAppError(new AiError('AI_CONTENT_RESTRICTED'))).toMatchObject({ code: 'FORBIDDEN' });
    expect(toAppError(new AiError('AI_INTERNAL_ERROR'))).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('openRouter adapter', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fails with AI_PROVIDER_UNAVAILABLE and makes no call when the key is missing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(openRouter.generate(request())).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends attribution headers, fallback models, the output cap and the no-training policy', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model: 'google/gemini-3.8-flash',
        choices: [{ message: { content: 'Hi there' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13, cost: 0.0001 },
      }),
    );

    const result = await openRouter.generate(request());
    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = init!.headers as Record<string, string>;
    const body = JSON.parse(init!.body as string);

    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['HTTP-Referer']).toBe('https://ailaxx.com');
    expect(headers['X-Title']).toBe('Aila');
    expect(body).toMatchObject({
      model: 'google/gemini-3.8-flash',
      models: ['google/gemini-3.8-flash', 'deepseek/deepseek-chat-v3.1'],
      max_tokens: 1000,
      stream: false,
      provider: { data_collection: 'deny' },
    });
    expect(result).toEqual({
      content: 'Hi there',
      model: 'google/gemini-3.8-flash',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13, cost: 0.0001, estimated: false },
    });
  });

  it('omits the models list when there is no fallback', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    );
    await openRouter.generate({ ...request(), models: ['qwen/qwen3-coder'] });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe('qwen/qwen3-coder');
    expect(body).not.toHaveProperty('models');
  });

  it('rejects an empty response and errors returned in a 200 body', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '  ' } }] }));
    await expect(openRouter.generate(request())).rejects.toMatchObject({ code: 'AI_INTERNAL_ERROR' });

    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: 503, message: 'down' } }));
    await expect(openRouter.generate(request())).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('reads Retry-After on a 429', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { code: 429, message: 'slow down' } }, { status: 429, headers: { 'retry-after': '1' } }),
    );
    await expect(openRouter.generate(request())).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      retryable: true,
      retryAfterMs: 1000,
    });
  });

  it('treats network failures as transient', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(openRouter.generate(request())).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      retryable: true,
    });
  });

  it('streams text and a final usage summary', async () => {
    fetchMock.mockResolvedValue(
      sse([
        ': OPENROUTER PROCESSING\n\n',
        'data: {"model":"deepseek/deepseek-chat-v3.1","choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],',
        '"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost":0.00001}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const events = [];
    for await (const event of await openRouter.stream(request())) events.push(event);

    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).stream).toBe(true);
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      {
        type: 'done',
        model: 'deepseek/deepseek-chat-v3.1',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, cost: 0.00001, estimated: false },
      },
    ]);
  });

  it('normalizes an error sent in the middle of a stream', async () => {
    fetchMock.mockResolvedValue(
      sse([
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"error":{"code":502,"message":"provider failed"},"choices":[{"delta":{"content":""},"finish_reason":"error"}]}\n\n',
      ]),
    );

    const iterate = async () => {
      for await (const event of await openRouter.stream(request())) void event;
    };
    await expect(iterate()).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('treats a stream that ends without [DONE] as a failure', async () => {
    fetchMock.mockResolvedValue(sse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n']));
    const iterate = async () => {
      for await (const event of await openRouter.stream(request())) void event;
    };
    await expect(iterate()).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });
});
