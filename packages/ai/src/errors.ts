import { AppError, type AppErrorCode } from '@aila/validation';

/**
 * Aila AI error categories (AI-GATEWAY §25). Provider errors are converted
 * to these inside the provider adapter and never reach product code.
 */

export const AI_ERROR_CODES = [
  'AI_AUTHENTICATION_ERROR',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_MODEL_UNAVAILABLE',
  'AI_INVALID_REQUEST',
  'AI_CONTEXT_TOO_LARGE',
  'AI_CONTENT_RESTRICTED',
  'AI_INTERNAL_ERROR',
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** Token usage reported by a provider, or estimated when it is missing. */
export type AiUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** Cost in USD as reported by the provider, when it reports one. */
  readonly cost: number | null;
  /** True when the provider did not report usage and it was estimated. */
  readonly estimated: boolean;
};

/** A normalized AI failure. Carries metadata only, never prompt or response text. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  /** Whether one retry may help (AI-GATEWAY §23). */
  readonly retryable: boolean;
  /** Provider HTTP status, for logs. */
  readonly status: number | null;
  /** Provider's requested wait before a retry. */
  readonly retryAfterMs: number | null;
  /** Usage already consumed when the failure happened, if known. */
  readonly usage: AiUsage | null;

  constructor(
    code: AiErrorCode,
    options: {
      retryable?: boolean;
      status?: number | null;
      retryAfterMs?: number | null;
      usage?: AiUsage | null;
    } = {},
  ) {
    super(code);
    this.name = 'AiError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.usage = options.usage ?? null;
  }
}

const APP_CODE_FOR: Readonly<Record<AiErrorCode, AppErrorCode>> = {
  AI_AUTHENTICATION_ERROR: 'DEPENDENCY_FAILURE',
  AI_RATE_LIMITED: 'RATE_LIMITED',
  AI_TIMEOUT: 'DEPENDENCY_FAILURE',
  AI_PROVIDER_UNAVAILABLE: 'DEPENDENCY_FAILURE',
  AI_MODEL_UNAVAILABLE: 'DEPENDENCY_FAILURE',
  AI_INVALID_REQUEST: 'VALIDATION_ERROR',
  AI_CONTEXT_TOO_LARGE: 'VALIDATION_ERROR',
  AI_CONTENT_RESTRICTED: 'FORBIDDEN',
  AI_INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/** Messages safe to show to the user. Codes without one use the app message. */
const AI_MESSAGES: Partial<Readonly<Record<AiErrorCode, string>>> = {
  AI_RATE_LIMITED: 'Aila AI is busy right now. Please try again in a moment.',
  AI_TIMEOUT: 'The AI took too long to respond. Please try again.',
  AI_PROVIDER_UNAVAILABLE: 'Aila AI is temporarily unavailable. Please try again.',
  AI_MODEL_UNAVAILABLE: 'Aila AI is temporarily unavailable. Please try again.',
  AI_AUTHENTICATION_ERROR: 'Aila AI is temporarily unavailable. Please try again.',
  AI_INVALID_REQUEST: 'This request could not be processed. Please change it and try again.',
  AI_CONTEXT_TOO_LARGE: 'This is too long for the AI. Shorten it or start a new conversation.',
  AI_CONTENT_RESTRICTED: 'This request can’t be processed. Please rephrase it.',
};

/** The application error for an AI failure; `reason` carries the AI code. */
export function toAppError(error: AiError): AppError {
  return new AppError(APP_CODE_FOR[error.code], {
    reason: error.code,
    message: AI_MESSAGES[error.code],
  });
}
