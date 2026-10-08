import { TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { TRPC_ERROR_CODES_BY_KEY } from '@trpc/server/rpc';
import {
  APP_ERROR_MESSAGES,
  isAppError,
  type AppError,
  type AppErrorCode,
} from '@aila/validation';

/**
 * Maps application errors to API responses (PLATFORM-FOUNDATION §36).
 * Clients receive a stable application code and a safe message; stack
 * traces, internal messages and causes never leave the server.
 */

const TRPC_CODE_FOR: Record<AppErrorCode, TRPC_ERROR_CODE_KEY> = {
  UNAUTHENTICATED: 'UNAUTHORIZED',
  UNAUTHORIZED: 'FORBIDDEN',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'TOO_MANY_REQUESTS',
  ENTITLEMENT_REQUIRED: 'PAYMENT_REQUIRED',
  TRIAL_EXPIRED: 'PAYMENT_REQUIRED',
  SUBSCRIPTION_REQUIRED: 'PAYMENT_REQUIRED',
  DEPENDENCY_FAILURE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_SERVER_ERROR',
};

const APP_CODE_FOR: Partial<Record<TRPC_ERROR_CODE_KEY, AppErrorCode>> = {
  UNAUTHORIZED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'VALIDATION_ERROR',
  PARSE_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'RATE_LIMITED',
  PAYMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
  SERVICE_UNAVAILABLE: 'DEPENDENCY_FAILURE',
};

export function toTRPCError(error: AppError): TRPCError {
  return new TRPCError({ code: TRPC_CODE_FOR[error.code], message: error.message, cause: error });
}

/** The first validation message from a schema error, if there is one. */
function firstIssueMessage(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) {
    return null;
  }

  const issues: unknown = Reflect.get(cause, 'issues');

  if (!Array.isArray(issues) || issues.length === 0) {
    return null;
  }

  const message: unknown = Reflect.get(Object(issues[0]), 'message');
  return typeof message === 'string' && message.length <= 200 ? message : null;
}

export type ApiErrorData = {
  readonly code: TRPC_ERROR_CODE_KEY;
  readonly httpStatus: number;
  readonly path: string | null;
  readonly appCode: AppErrorCode;
  readonly reason: string | null;
  readonly requestId: string | null;
};

export type ApiErrorShape = {
  readonly message: string;
  readonly code: number;
  readonly data: ApiErrorData;
};

/** The safe error shape sent to clients for any failed procedure. */
export function formatApiError(
  error: TRPCError,
  options: { readonly path?: string; readonly requestId?: string } = {},
): ApiErrorShape {
  const cause = error.cause;
  let appCode: AppErrorCode;
  let message: string;
  let reason: string | null = null;

  if (isAppError(cause)) {
    appCode = cause.code;
    message = cause.message;
    reason = cause.reason ?? null;
  } else {
    appCode = APP_CODE_FOR[error.code] ?? 'INTERNAL_ERROR';
    message =
      (appCode === 'VALIDATION_ERROR' ? firstIssueMessage(cause) : null) ??
      APP_ERROR_MESSAGES[appCode];
  }

  return {
    message,
    code: TRPC_ERROR_CODES_BY_KEY[error.code],
    data: {
      code: error.code,
      httpStatus: getHTTPStatusCodeFromError(error),
      path: options.path ?? null,
      appCode,
      reason,
      requestId: options.requestId ?? null,
    },
  };
}

/** A complete tRPC error response, for requests refused before routing. */
export function apiErrorResponse(
  error: AppError,
  requestId: string,
  headers: Record<string, string>,
): Response {
  const trpcError = toTRPCError(error);
  const shape = formatApiError(trpcError, { requestId });

  return Response.json(
    { error: shape },
    { status: shape.data.httpStatus, headers },
  );
}
