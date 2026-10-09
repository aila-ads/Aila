import { AiError, type AiErrorCode, type AiUsage } from '../errors';
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResult,
  ProviderStreamEvent,
} from './types';

/**
 * OpenRouter adapter (AILA-V1-ARCHITECTURE §19, AI-GATEWAY §4, §33): the
 * only code that knows OpenRouter. Uses its OpenAI-compatible HTTP API with
 * plain fetch. The key is server-only and read at call time, so a missing
 * key fails the request, never the build or module import.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const APP_URL = 'https://ailaxx.com';
const APP_TITLE = 'Aila';

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    console.error('[ai] OPENROUTER_API_KEY is not configured');
    throw new AiError('AI_PROVIDER_UNAVAILABLE');
  }

  return key;
}

function requestInit(request: ProviderRequest, stream: boolean): RequestInit {
  const [model, ...fallbacks] = request.models;

  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify({
      model,
      ...(fallbacks.length > 0 ? { models: request.models } : {}),
      messages: request.messages,
      max_tokens: request.maxOutputTokens,
      stream,
      // Only providers that do not store or train on inputs (AI-GATEWAY §29).
      provider: { data_collection: 'deny' },
    }),
    signal: request.signal,
  };
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get('retry-after');

  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

const CONTEXT_MESSAGE = /context|too long|too many tokens|maximum.*tokens/i;

/**
 * Maps an OpenRouter error status to an Aila AI error (AI-GATEWAY §25).
 * The provider message is used only to tell context-length errors apart;
 * it is never logged or returned.
 */
export function normalizeError(
  status: number,
  options: { message?: string; retryAfterMs?: number | null; usage?: AiUsage | null } = {},
): AiError {
  const extra = { status, usage: options.usage ?? null };
  let code: AiErrorCode;

  switch (true) {
    case status === 400:
    case status === 422:
      code = CONTEXT_MESSAGE.test(options.message ?? '') ? 'AI_CONTEXT_TOO_LARGE' : 'AI_INVALID_REQUEST';
      break;
    case status === 401:
      code = 'AI_AUTHENTICATION_ERROR';
      break;
    // 402: the OpenRouter account or key is out of credits.
    case status === 402:
      code = 'AI_PROVIDER_UNAVAILABLE';
      break;
    case status === 403:
      code = 'AI_CONTENT_RESTRICTED';
      break;
    case status === 404:
      code = 'AI_MODEL_UNAVAILABLE';
      break;
    case status === 408:
      code = 'AI_TIMEOUT';
      break;
    case status === 413:
      code = 'AI_CONTEXT_TOO_LARGE';
      break;
    case status === 429:
      return new AiError('AI_RATE_LIMITED', {
        ...extra,
        retryable: true,
        retryAfterMs: options.retryAfterMs ?? null,
      });
    case status >= 500:
      return new AiError('AI_PROVIDER_UNAVAILABLE', { ...extra, retryable: true });
    default:
      code = 'AI_INTERNAL_ERROR';
  }

  return new AiError(code, extra);
}

/** Sends the request; network failures are transient, aborts are rethrown. */
async function send(request: ProviderRequest, stream: boolean): Promise<Response> {
  const init = requestInit(request, stream);
  let response: Response;

  try {
    response = await fetch(ENDPOINT, init);
  } catch (error) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? error;
    }
    throw new AiError('AI_PROVIDER_UNAVAILABLE', { retryable: true });
  }

  if (!response.ok) {
    let message: string | undefined;

    try {
      const body = (await response.json()) as { error?: { message?: unknown } };
      message = typeof body.error?.message === 'string' ? body.error.message : undefined;
    } catch {
      message = undefined;
    }

    throw normalizeError(response.status, { message, retryAfterMs: retryAfterMs(response) });
  }

  return response;
}

type RawUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  cost?: unknown;
};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

export function parseUsage(raw: RawUsage | null | undefined): AiUsage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const inputTokens = count(raw.prompt_tokens);
  const outputTokens = count(raw.completion_tokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens: count(raw.total_tokens) || inputTokens + outputTokens,
    cost: typeof raw.cost === 'number' && Number.isFinite(raw.cost) ? raw.cost : null,
    estimated: false,
  };
}

type RawError = { code?: unknown; message?: unknown };

function errorFromBody(error: RawError, usage: AiUsage | null): AiError {
  const status = typeof error.code === 'number' ? error.code : 502;
  return normalizeError(status, {
    message: typeof error.message === 'string' ? error.message : undefined,
    usage,
  });
}

type CompletionBody = {
  model?: unknown;
  error?: RawError;
  usage?: RawUsage;
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown };
    delta?: { content?: unknown };
  }>;
};

async function generate(request: ProviderRequest): Promise<ProviderResult> {
  const response = await send(request, false);
  let body: CompletionBody;

  try {
    body = (await response.json()) as CompletionBody;
  } catch (error) {
    if (request.signal.aborted) {
      throw request.signal.reason ?? error;
    }
    throw new AiError('AI_PROVIDER_UNAVAILABLE', { retryable: true });
  }

  const usage = parseUsage(body.usage);

  if (body.error) {
    throw errorFromBody(body.error, usage);
  }

  // Validate the provider response before it is trusted (AI-GATEWAY §9).
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;

  if (typeof content !== 'string' || content.trim().length === 0 || finishReason === 'error') {
    throw new AiError('AI_INTERNAL_ERROR', { usage });
  }

  return {
    content,
    model: typeof body.model === 'string' ? body.model : request.models[0]!,
    finishReason,
    usage: usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: null,
      estimated: true,
    },
  };
}

/** Parses OpenRouter's server-sent events into text and a final summary. */
async function* readStream(
  response: Response,
  request: ProviderRequest,
): AsyncGenerator<ProviderStreamEvent> {
  const body = response.body;

  if (!body) {
    throw new AiError('AI_PROVIDER_UNAVAILABLE');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let model: string | null = null;
  let finishReason: string | null = null;
  let usage: AiUsage | null = null;

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;

      try {
        chunk = await reader.read();
      } catch (error) {
        if (request.signal.aborted) {
          throw request.signal.reason ?? error;
        }
        throw new AiError('AI_PROVIDER_UNAVAILABLE');
      }

      if (chunk.done) {
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();

        // Blank lines separate events; ":" lines are keep-alive comments.
        if (!line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();

        if (data === '[DONE]') {
          yield { type: 'done', model, finishReason, usage };
          return;
        }

        let event: CompletionBody;

        try {
          event = JSON.parse(data) as CompletionBody;
        } catch {
          throw new AiError('AI_INTERNAL_ERROR', { usage });
        }

        usage = parseUsage(event.usage) ?? usage;

        if (event.error) {
          throw errorFromBody(event.error, usage);
        }

        if (typeof event.model === 'string') {
          model = event.model;
        }

        const choice = event.choices?.[0];

        if (typeof choice?.finish_reason === 'string') {
          finishReason = choice.finish_reason;
        }

        const text = choice?.delta?.content;

        if (typeof text === 'string' && text.length > 0) {
          yield { type: 'text', text };
        }
      }
    }

    // The stream ended without [DONE]: the provider connection dropped.
    throw new AiError('AI_PROVIDER_UNAVAILABLE', { usage });
  } finally {
    // Stops the provider connection when the consumer stops early.
    reader.cancel().catch(() => undefined);
  }
}

async function stream(request: ProviderRequest): Promise<AsyncIterable<ProviderStreamEvent>> {
  const response = await send(request, true);
  return readStream(response, request);
}

export const openRouter: ProviderAdapter = {
  name: 'openrouter',
  generate,
  stream,
};
