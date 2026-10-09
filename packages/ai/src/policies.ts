import type { AiCapability } from '@aila/validation';
import { AiError } from './errors';

/**
 * AI limits, timeouts and retries: the one configuration module for the AI
 * gateway (PLATFORM-FOUNDATION §18, AI-GATEWAY §14, §22-23, §27). Values
 * here are server configuration and are never taken from client input.
 */

export type AiPlan = 'TRIAL' | 'PRO';

export type AiUsageLimits = {
  /** Successful or cancelled AI requests allowed in the window. */
  readonly requests: number;
  /** Total input + output tokens allowed in the window. */
  readonly tokens: number;
  /** Largest response for one request. */
  readonly maxOutputTokens: number;
};

/**
 * TRIAL: per three-hour trial, counted from the trial start.
 * PRO: per account per rolling 24 hours, until billing (step 9) defines
 * plan limits. Accounts with only ADMIN/SYSTEM grants use PRO limits.
 */
export const AI_USAGE_LIMITS: Readonly<Record<AiPlan, AiUsageLimits>> = {
  TRIAL: { requests: 30, tokens: 100_000, maxOutputTokens: 4_096 },
  PRO: { requests: 500, tokens: 2_000_000, maxOutputTokens: 4_096 },
};

export const PRO_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A request is refused when fewer output tokens than this would remain. */
export const MIN_OUTPUT_TOKENS = 256;

/** Operation types with their own timeouts (AI-GATEWAY §22). */
export type AiOperation = 'short_generation' | 'long_reasoning' | 'document_analysis';

/**
 * Whole-request deadlines, retries included. Streams use the same value
 * for the complete stream. All stay below the 300-second function limit.
 */
export const AI_TIMEOUTS_MS: Readonly<Record<AiOperation, number>> = {
  short_generation: 90_000,
  long_reasoning: 240_000,
  document_analysis: 180_000,
};

/** Largest total input per capability, in characters (AI-GATEWAY §16, §18). */
export const AI_MAX_INPUT_CHARS: Readonly<Record<AiCapability, number>> = {
  fast: 120_000,
  balanced: 120_000,
  reasoning: 120_000,
  coding: 200_000,
  long_context: 1_000_000,
};

/** At most one retry, only for transient failures (AI-GATEWAY §23). */
export const AI_RETRY = {
  maxRetries: 1,
  baseDelayMs: 300,
  maxJitterMs: 700,
  /** A provider asking to wait longer than this is not retried. */
  maxRetryAfterMs: 2_000,
} as const;

/** Rough token estimate (about 4 characters per token) for budgets and cancelled streams. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Start of the usage window for a plan. */
export function usageWindowStart(plan: AiPlan, now: Date, trialStartedAt: Date | null): Date {
  if (plan === 'TRIAL') {
    if (!trialStartedAt) {
      throw new Error('Trial start is required for trial usage limits');
    }
    return trialStartedAt;
  }

  return new Date(now.getTime() - PRO_USAGE_WINDOW_MS);
}

export type UsageSoFar = { readonly requests: number; readonly tokens: number };

/**
 * The output-token budget for the next request, or null when the account
 * has reached its limit. Input is estimated so one request cannot overshoot
 * the token allowance by much (AI-GATEWAY §27).
 */
export function outputTokenBudget(
  limits: AiUsageLimits,
  used: UsageSoFar,
  inputChars: number,
): number | null {
  if (used.requests >= limits.requests) {
    return null;
  }

  const remaining = limits.tokens - used.tokens - estimateTokens(inputChars);

  if (remaining < MIN_OUTPUT_TOKENS) {
    return null;
  }

  return Math.min(limits.maxOutputTokens, remaining);
}

/** Whether a failed attempt may be retried once more. */
export function shouldRetry(error: unknown, attempt: number): boolean {
  if (!(error instanceof AiError) || !error.retryable || attempt >= AI_RETRY.maxRetries) {
    return false;
  }

  return error.retryAfterMs === null || error.retryAfterMs <= AI_RETRY.maxRetryAfterMs;
}

/** Delay before a retry: the provider's Retry-After or a base delay, plus jitter. */
export function retryDelayMs(error: AiError, random: () => number = Math.random): number {
  const base = error.retryAfterMs ?? AI_RETRY.baseDelayMs;
  return base + Math.floor(random() * AI_RETRY.maxJitterMs);
}
