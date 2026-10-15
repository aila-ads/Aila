/**
 * Shared error categories (PLATFORM-FOUNDATION §36, APPLICATION-ARCHITECTURE
 * §32, §36). Every message here is generic and safe to show to a user;
 * internal details stay in server-side diagnostics (SECURITY-ARCHITECTURE
 * §10.2).
 */

export const APP_ERROR_CODES = [
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'ENTITLEMENT_REQUIRED',
  'TRIAL_EXPIRED',
  'SUBSCRIPTION_REQUIRED',
  'DEPENDENCY_FAILURE',
  'INTERNAL_ERROR',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const APP_ERROR_MESSAGES: Readonly<Record<AppErrorCode, string>> = {
  UNAUTHENTICATED: 'Sign in to continue.',
  UNAUTHORIZED: 'You do not have access to this.',
  FORBIDDEN: 'You do not have access to this.',
  NOT_FOUND: 'We could not find that.',
  VALIDATION_ERROR: 'Check the form and try again.',
  CONFLICT: 'This change conflicts with the current state. Refresh and try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  ENTITLEMENT_REQUIRED: 'Your plan does not include this.',
  TRIAL_EXPIRED: 'Your free trial has ended.',
  SUBSCRIPTION_REQUIRED: 'An Aila Pro subscription is required.',
  DEPENDENCY_FAILURE: 'A service we rely on is unavailable. Please try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

/**
 * An expected application error. `reason` is a stable machine-readable
 * detail that code can act on (it is never displayed as text); `message`
 * must be safe to show to the user.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly reason: string | undefined;

  constructor(
    code: AppErrorCode,
    options: { reason?: string; message?: string } = {},
  ) {
    super(options.message ?? APP_ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.reason = options.reason;
  }
}

export function isAppError(value: unknown): value is AppError {
  if (value instanceof AppError) {
    return true;
  }

  // Also recognise AppErrors from another copy of this module.
  if (!(value instanceof Error) || value.name !== 'AppError') {
    return false;
  }

  const code: unknown = Reflect.get(value, 'code');
  return typeof code === 'string' && (APP_ERROR_CODES as readonly string[]).includes(code);
}
