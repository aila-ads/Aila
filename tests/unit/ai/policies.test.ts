import { describe, expect, it } from 'vitest';
import { AI_CAPABILITIES } from '../../../packages/validation/src/ai';
import { AiError } from '../../../packages/ai/src/errors';
import { MODEL_POLICY, modelsFor } from '../../../packages/ai/src/models';
import {
  AI_RETRY,
  AI_TIMEOUTS_MS,
  AI_USAGE_LIMITS,
  AI_WEB_SEARCH_LIMITS,
  canWebSearch,
  MIN_OUTPUT_TOKENS,
  webSearchWindowStart,
  outputTokenBudget,
  PRO_USAGE_WINDOW_MS,
  retryDelayMs,
  shouldRetry,
  usageWindowStart,
} from '../../../packages/ai/src/policies';

describe('model policy', () => {
  it('maps every capability to a model on the server', () => {
    for (const capability of AI_CAPABILITIES) {
      expect(MODEL_POLICY[capability].primary).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
      expect(AI_TIMEOUTS_MS[MODEL_POLICY[capability].operation]).toBeGreaterThan(0);
    }
  });

  it('uses the approved launch models', () => {
    expect(MODEL_POLICY.fast.primary).toBe('google/gemini-3.8-flash');
    expect(MODEL_POLICY.balanced.primary).toBe('deepseek/deepseek-chat-v3.1');
    expect(MODEL_POLICY.reasoning.primary).toBe('deepseek/deepseek-r1');
    expect(MODEL_POLICY.coding.primary).toBe('qwen/qwen3-coder');
    expect(MODEL_POLICY.long_context.primary).toBe('google/gemini-3.8-flash');
    expect(MODEL_POLICY.vision.primary).toBe('google/gemini-3.8-flash');
    expect(MODEL_POLICY.transcribe.primary).toBe('google/gemini-3.5-flash-lite');
  });

  it('enables fallback only for fast and balanced, to another model family', () => {
    for (const capability of AI_CAPABILITIES) {
      const { primary, fallbacks } = MODEL_POLICY[capability];
      const expected = capability === 'fast' || capability === 'balanced' ? 1 : 0;
      expect(fallbacks).toHaveLength(expected);
      for (const fallback of fallbacks) {
        expect(fallback.split('/')[0]).not.toBe(primary.split('/')[0]);
      }
    }
    expect(modelsFor('fast')).toEqual(['google/gemini-3.8-flash', 'deepseek/deepseek-chat-v3.1']);
    expect(modelsFor('coding')).toEqual(['qwen/qwen3-coder']);
  });

  it('requires advanced_models only for reasoning', () => {
    for (const capability of AI_CAPABILITIES) {
      expect(MODEL_POLICY[capability].entitlement).toBe(
        capability === 'reasoning' ? 'advanced_models' : null,
      );
    }
  });

  it('keeps every timeout below the 300-second function limit', () => {
    for (const ms of Object.values(AI_TIMEOUTS_MS)) {
      expect(ms).toBeLessThan(300_000);
    }
  });
});

describe('usage limits', () => {
  it('has the approved trial and Pro limits', () => {
    expect(AI_USAGE_LIMITS.TRIAL).toEqual({ requests: 30, tokens: 100_000, maxOutputTokens: 4_096 });
    expect(AI_USAGE_LIMITS.PRO).toEqual({ requests: 500, tokens: 2_000_000, maxOutputTokens: 4_096 });
  });

  it('counts the trial from its start and Pro over the last 24 hours', () => {
    const now = new Date('2026-10-09T12:00:00.000Z');
    const start = new Date('2026-10-09T10:00:00.000Z');
    expect(usageWindowStart('TRIAL', now, start)).toEqual(start);
    expect(usageWindowStart('PRO', now, null).getTime()).toBe(now.getTime() - PRO_USAGE_WINDOW_MS);
    expect(() => usageWindowStart('TRIAL', now, null)).toThrow();
  });

  it('caps output at 4k tokens and at the remaining allowance', () => {
    const trial = AI_USAGE_LIMITS.TRIAL;
    expect(outputTokenBudget(trial, { requests: 0, tokens: 0 }, 400)).toBe(4_096);
    expect(outputTokenBudget(trial, { requests: 5, tokens: 98_000 }, 400)).toBe(1_900);
  });

  it('refuses when the request or token allowance is used up', () => {
    const trial = AI_USAGE_LIMITS.TRIAL;
    expect(outputTokenBudget(trial, { requests: 30, tokens: 0 }, 10)).toBeNull();
    expect(outputTokenBudget(trial, { requests: 1, tokens: 100_000 }, 10)).toBeNull();
    expect(
      outputTokenBudget(trial, { requests: 1, tokens: 100_000 - MIN_OUTPUT_TOKENS }, 40),
    ).toBeNull();
  });
});

describe('retry policy', () => {
  const transient = new AiError('AI_PROVIDER_UNAVAILABLE', { retryable: true, status: 503 });

  it('retries a transient failure once only', () => {
    expect(AI_RETRY.maxRetries).toBe(1);
    expect(shouldRetry(transient, 0)).toBe(true);
    expect(shouldRetry(transient, 1)).toBe(false);
  });

  it('never retries permanent failures or unknown errors', () => {
    expect(shouldRetry(new AiError('AI_INVALID_REQUEST', { status: 400 }), 0)).toBe(false);
    expect(shouldRetry(new AiError('AI_AUTHENTICATION_ERROR', { status: 401 }), 0)).toBe(false);
    expect(shouldRetry(new Error('boom'), 0)).toBe(false);
  });

  it('respects a short Retry-After and skips a long one', () => {
    const short = new AiError('AI_RATE_LIMITED', { retryable: true, retryAfterMs: 1_000 });
    const long = new AiError('AI_RATE_LIMITED', { retryable: true, retryAfterMs: 30_000 });
    expect(shouldRetry(short, 0)).toBe(true);
    expect(shouldRetry(long, 0)).toBe(false);
    expect(retryDelayMs(short, () => 0)).toBe(1_000);
  });

  it('adds bounded jitter', () => {
    expect(retryDelayMs(transient, () => 0)).toBe(AI_RETRY.baseDelayMs);
    expect(retryDelayMs(transient, () => 0.999)).toBeLessThan(
      AI_RETRY.baseDelayMs + AI_RETRY.maxJitterMs,
    );
  });
});

describe('web search limits', () => {
  it('allows 5 searches a day on the trial and 50 on Pro', () => {
    expect(AI_WEB_SEARCH_LIMITS).toEqual({ TRIAL: 5, PRO: 50 });
    expect(canWebSearch('TRIAL', 4)).toBe(true);
    expect(canWebSearch('TRIAL', 5)).toBe(false);
    expect(canWebSearch('PRO', 49)).toBe(true);
    expect(canWebSearch('PRO', 50)).toBe(false);
  });

  it('counts over a rolling 24 hours', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(webSearchWindowStart(now).toISOString()).toBe('2026-10-09T12:00:00.000Z');
  });
});
