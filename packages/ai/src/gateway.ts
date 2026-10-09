import {
  PRODUCT_ENTITLEMENT_KEYS,
  requireEntitlement,
  withinRateLimits,
  type AccountContext,
} from '@aila/auth/server';
import { getDb, type ProductCode } from '@aila/db';
import {
  AI_CAPABILITIES,
  AppError,
  aiMessageMedia,
  aiMessagesSchema,
  aiMessageText,
  type AiCapability,
  type AiMessage,
} from '@aila/validation';
import { AiError, toAppError, type AiUsage } from './errors';
import { MODEL_POLICY, modelsFor } from './models';
import {
  AI_AUDIO_CHARS,
  AI_IMAGE_CHARS,
  AI_MAX_INPUT_CHARS,
  AI_TIMEOUTS_MS,
  AI_USAGE_LIMITS,
  estimateTokens,
  outputTokenBudget,
  retryDelayMs,
  shouldRetry,
  usageWindowStart,
  type AiPlan,
} from './policies';
import { openRouter } from './providers/openrouter';
import type { ProviderAdapter, ProviderRequest, ProviderStreamEvent } from './providers/types';
import { getUsageSince, isDuplicateRequest, recordUsage } from './usage';

/**
 * The Aila AI Gateway (AI-GATEWAY §9, AILA-V1-ARCHITECTURE §18): the single
 * entry point for AI. Lifecycle: authenticated context → entitlement →
 * rate and usage limits → validation → model policy → provider → usage
 * record → normalized result. The account always comes from the trusted
 * context; products cannot pass an account, model, limit or timeout.
 */

export type AiProduct = (typeof PRODUCT_ENTITLEMENT_KEYS)[number];

export type AiRequest = {
  readonly product: AiProduct;
  readonly capability: AiCapability;
  /** Product instructions, history and the user's message, ending with the user. */
  readonly messages: readonly AiMessage[];
  /** Optional key that makes a repeated submission fail instead of running twice. */
  readonly idempotencyKey?: string;
};

export type AiCallOptions = {
  readonly requestId: string;
  /** Aborts the provider call, e.g. when the client disconnects (AI-GATEWAY §21). */
  readonly signal?: AbortSignal;
};

export type AiResult = {
  readonly content: string;
  readonly model: string;
  readonly finishReason: string | null;
  readonly usage: AiUsage;
};

export type AiStreamEvent =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'done';
      readonly model: string;
      readonly finishReason: string | null;
      readonly usage: AiUsage;
    };

const provider: ProviderAdapter = openRouter;

type Prepared = {
  readonly product: ProductCode;
  readonly capability: AiCapability;
  readonly messages: readonly AiMessage[];
  readonly models: readonly string[];
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly inputChars: number;
  readonly idempotencyKey: string | null;
};

const invalid = () => new AppError('VALIDATION_ERROR', { reason: 'AI_INVALID_REQUEST' });

function usageLimitError(plan: AiPlan): AppError {
  return new AppError('RATE_LIMITED', {
    reason: 'AI_USAGE_LIMIT_REACHED',
    message:
      plan === 'TRIAL'
        ? 'You’ve used the AI allowance included in your free trial.'
        : 'You’ve reached your AI usage limit for today. Please try again later.',
  });
}

/** Steps 3-7 of the lifecycle: everything before provider consumption. */
async function prepare(
  ctx: AccountContext,
  request: AiRequest,
  requestId: string,
): Promise<Prepared> {
  // Request shape from server-side product code.
  if (
    !(PRODUCT_ENTITLEMENT_KEYS as readonly string[]).includes(request.product) ||
    !(AI_CAPABILITIES as readonly string[]).includes(request.capability) ||
    (request.idempotencyKey !== undefined &&
      (request.idempotencyKey.length < 1 || request.idempotencyKey.length > 200))
  ) {
    throw invalid();
  }

  // Authorization and entitlement from the central service.
  const { keys, proAccess } = await requireEntitlement(ctx, request.product, requestId);

  const required = MODEL_POLICY[request.capability].entitlement;

  if (required && !keys.includes(required)) {
    throw new AppError('ENTITLEMENT_REQUIRED', { reason: 'AI_MODEL_NOT_INCLUDED' });
  }

  // Burst rate limit (Upstash; fails closed).
  if (!(await withinRateLimits([['aiRequestPerAccount', ctx.account.id]]))) {
    throw new AppError('RATE_LIMITED', { reason: 'AI_RATE_LIMITED' });
  }

  // Validation of the content and its size for this capability.
  const parsed = aiMessagesSchema.safeParse(request.messages);

  if (!parsed.success) {
    throw invalid();
  }

  const messages = parsed.data;
  const media = messages.reduce(
    (total, message) => {
      const counts = aiMessageMedia(message);
      return { images: total.images + counts.images, audio: total.audio + counts.audio };
    },
    { images: 0, audio: 0 },
  );

  // Audio only for transcription, and images never with it. Requests with
  // images go to the vision model, whatever capability was asked for.
  if (
    (media.audio > 0 && request.capability !== 'transcribe') ||
    (request.capability === 'transcribe' && (media.images > 0 || media.audio !== 1))
  ) {
    throw invalid();
  }

  const capability: AiCapability = media.images > 0 ? 'vision' : request.capability;
  const textChars = messages.reduce((total, message) => total + aiMessageText(message).length, 0);

  if (textChars > AI_MAX_INPUT_CHARS[capability]) {
    throw new AppError('VALIDATION_ERROR', {
      reason: 'AI_CONTEXT_TOO_LARGE',
      message: 'This is too long for the AI. Shorten it or start a new conversation.',
    });
  }

  // Images and audio count against the token allowance too.
  const inputChars = textChars + media.images * AI_IMAGE_CHARS + media.audio * AI_AUDIO_CHARS;

  // Usage limits, counted in Postgres (Redis is not authoritative).
  const plan: AiPlan = proAccess.allowed && proAccess.source === 'TRIAL' ? 'TRIAL' : 'PRO';
  const trial =
    plan === 'TRIAL'
      ? await getDb().trial.findUnique({
          where: { accountId: ctx.account.id },
          select: { startedAt: true },
        })
      : null;
  const used = await getUsageSince(ctx, usageWindowStart(plan, new Date(), trial?.startedAt ?? null));
  const maxOutputTokens = outputTokenBudget(AI_USAGE_LIMITS[plan], used, inputChars);

  if (maxOutputTokens === null) {
    throw usageLimitError(plan);
  }

  const idempotencyKey = request.idempotencyKey ?? null;

  if (idempotencyKey && (await isDuplicateRequest(ctx, idempotencyKey))) {
    throw new AppError('CONFLICT', { reason: 'AI_DUPLICATE_REQUEST' });
  }

  return {
    product: request.product.toUpperCase() as ProductCode,
    capability,
    messages,
    models: modelsFor(capability),
    maxOutputTokens,
    timeoutMs: AI_TIMEOUTS_MS[MODEL_POLICY[capability].operation],
    inputChars,
    idempotencyKey,
  };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Runs a provider call with at most one retry on transient failures. */
async function withRetry<T>(
  call: () => Promise<T>,
  signal: AbortSignal,
  attempts: { count: number },
): Promise<T> {
  for (;;) {
    attempts.count += 1;

    try {
      return await call();
    } catch (error) {
      if (signal.aborted || !shouldRetry(error, attempts.count - 1)) {
        throw error;
      }

      await wait(retryDelayMs(error as AiError), signal);
    }
  }
}

type Outcome = {
  readonly status: 'SUCCESS' | 'FAILURE' | 'CANCELLED';
  readonly error: AiError | null;
};

/** Classifies a failure: client abort, deadline, AI error or internal error. */
function classify(error: unknown, client: AbortSignal | undefined, deadline: AbortSignal): Outcome {
  if (client?.aborted) {
    return { status: 'CANCELLED', error: null };
  }

  if (deadline.aborted) {
    return { status: 'FAILURE', error: new AiError('AI_TIMEOUT') };
  }

  return {
    status: 'FAILURE',
    error: error instanceof AiError ? error : new AiError('AI_INTERNAL_ERROR'),
  };
}

function log(
  requestId: string,
  prepared: Prepared,
  details: { status: string; code: string | null; model: string; durationMs: number; attempts: number; httpStatus?: number | null },
): void {
  // Metadata only: never prompts, responses or keys (AI-GATEWAY §29, §31).
  const entry = { requestId, capability: prepared.capability, ...details };

  if (details.status === 'FAILURE') {
    console.error('[ai] Request failed', entry);
  } else {
    console.info('[ai] Request finished', entry);
  }
}

function estimatedUsage(prepared: Prepared, outputChars: number): AiUsage {
  const inputTokens = estimateTokens(prepared.inputChars);
  const outputTokens = estimateTokens(outputChars);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cost: null, estimated: true };
}

/** Thrown to the product: AppError for AI failures, or the client's abort reason. */
function failure(outcome: Outcome, client: AbortSignal | undefined): unknown {
  if (outcome.status === 'CANCELLED') {
    return client?.reason ?? new AppError('INTERNAL_ERROR');
  }

  return toAppError(outcome.error ?? new AiError('AI_INTERNAL_ERROR'));
}

/** Generates a complete response. */
export async function generate(
  ctx: AccountContext,
  request: AiRequest,
  options: AiCallOptions,
): Promise<AiResult> {
  const prepared = await prepare(ctx, request, options.requestId);
  const deadline = AbortSignal.timeout(prepared.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const providerRequest: ProviderRequest = {
    models: prepared.models,
    messages: prepared.messages,
    maxOutputTokens: prepared.maxOutputTokens,
    signal,
  };
  const attempts = { count: 0 };
  const startedAt = Date.now();

  const finish = async (
    status: Outcome['status'],
    model: string,
    usage: AiUsage | null,
    error: AiError | null,
  ) => {
    const durationMs = Date.now() - startedAt;
    log(options.requestId, prepared, {
      status,
      code: error?.code ?? null,
      httpStatus: error?.status ?? null,
      model,
      durationMs,
      attempts: attempts.count,
    });
    await recordUsage(ctx, {
      product: prepared.product,
      capability: prepared.capability,
      provider: provider.name,
      model,
      requestId: options.requestId,
      idempotencyKey: prepared.idempotencyKey,
      usage,
      durationMs,
      status,
      attempts: attempts.count,
      errorCode: error?.code ?? null,
    });
  };

  try {
    const result = await withRetry(() => provider.generate(providerRequest), signal, attempts);
    await finish('SUCCESS', result.model, result.usage, null);
    return result;
  } catch (error) {
    const outcome = classify(error, options.signal, deadline);
    // A cancelled call may still have been billed: record an estimate.
    const usage =
      outcome.error?.usage ?? (outcome.status === 'CANCELLED' ? estimatedUsage(prepared, 0) : null);
    await finish(outcome.status, prepared.models[0]!, usage, outcome.error);
    throw failure(outcome, options.signal);
  }
}

/**
 * Streams a response. Every check runs, and the provider must accept the
 * request, before this resolves; errors before that are thrown here. The
 * returned iterator yields text, then one `done` event; consume it right
 * away. Stopping iteration or aborting `signal` cancels the provider call;
 * usage is recorded on completion, cancellation or failure (AI-GATEWAY §21).
 */
export async function stream(
  ctx: AccountContext,
  request: AiRequest,
  options: AiCallOptions,
): Promise<AsyncIterable<AiStreamEvent>> {
  const prepared = await prepare(ctx, request, options.requestId);
  const deadline = AbortSignal.timeout(prepared.timeoutMs);
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    deadline,
    ...(options.signal ? [options.signal] : []),
  ]);
  const providerRequest: ProviderRequest = {
    models: prepared.models,
    messages: prepared.messages,
    maxOutputTokens: prepared.maxOutputTokens,
    signal,
  };
  const attempts = { count: 0 };
  const startedAt = Date.now();

  const finish = async (
    outcome: Outcome,
    model: string,
    usage: AiUsage | null,
  ): Promise<void> => {
    const durationMs = Date.now() - startedAt;
    log(options.requestId, prepared, {
      status: outcome.status,
      code: outcome.error?.code ?? null,
      httpStatus: outcome.error?.status ?? null,
      model,
      durationMs,
      attempts: attempts.count,
    });
    await recordUsage(ctx, {
      product: prepared.product,
      capability: prepared.capability,
      provider: provider.name,
      model,
      requestId: options.requestId,
      idempotencyKey: prepared.idempotencyKey,
      usage,
      durationMs,
      status: outcome.status,
      attempts: attempts.count,
      errorCode: outcome.error?.code ?? null,
    });
  };

  let events: AsyncIterable<ProviderStreamEvent>;

  try {
    // Only the opening request is retried; nothing has reached the client yet.
    events = await withRetry(() => provider.stream(providerRequest), signal, attempts);
  } catch (error) {
    const outcome = classify(error, options.signal, deadline);
    await finish(outcome, prepared.models[0]!, outcome.error?.usage ?? null);
    throw failure(outcome, options.signal);
  }

  async function* consume(): AsyncGenerator<AiStreamEvent> {
    let outputChars = 0;
    let model = prepared.models[0]!;
    let settled = false;

    try {
      for await (const event of events) {
        if (event.type === 'text') {
          outputChars += event.text.length;
          yield event;
          continue;
        }

        model = event.model ?? model;

        if (outputChars === 0 || event.finishReason === 'error') {
          throw new AiError('AI_INTERNAL_ERROR', { usage: event.usage });
        }

        const usage = event.usage ?? estimatedUsage(prepared, outputChars);
        settled = true;
        await finish({ status: 'SUCCESS', error: null }, model, usage);
        yield { type: 'done', model, finishReason: event.finishReason, usage };
        return;
      }
    } catch (error) {
      const outcome = classify(error, options.signal, deadline);
      settled = true;
      await finish(outcome, model, outcome.error?.usage ?? estimatedUsage(prepared, outputChars));
      throw failure(outcome, options.signal);
    } finally {
      if (!settled) {
        // The consumer stopped early: cancel the provider and record it.
        controller.abort();
        await finish({ status: 'CANCELLED', error: null }, model, estimatedUsage(prepared, outputChars));
      }
    }
  }

  return consume();
}
