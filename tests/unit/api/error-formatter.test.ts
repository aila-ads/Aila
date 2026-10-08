import { describe, expect, it } from 'vitest';
// tRPC is a dependency of the web app only, so it is resolved from there.
import { TRPCError } from '../../../apps/web/node_modules/@trpc/server';
import { formatApiError, toTRPCError } from '../../../apps/web/server/api/errors';
import { AppError } from '../../../packages/validation/src/errors';

describe('toTRPCError', () => {
  it.each([
    ['UNAUTHENTICATED', 'UNAUTHORIZED', 401],
    ['FORBIDDEN', 'FORBIDDEN', 403],
    ['NOT_FOUND', 'NOT_FOUND', 404],
    ['VALIDATION_ERROR', 'BAD_REQUEST', 400],
    ['CONFLICT', 'CONFLICT', 409],
    ['RATE_LIMITED', 'TOO_MANY_REQUESTS', 429],
    ['SUBSCRIPTION_REQUIRED', 'PAYMENT_REQUIRED', 402],
    ['DEPENDENCY_FAILURE', 'SERVICE_UNAVAILABLE', 503],
    ['INTERNAL_ERROR', 'INTERNAL_SERVER_ERROR', 500],
  ] as const)('maps %s to %s', (appCode, trpcCode, status) => {
    const error = toTRPCError(new AppError(appCode));
    expect(error.code).toBe(trpcCode);
    expect(formatApiError(error).data.httpStatus).toBe(status);
  });
});

describe('formatApiError', () => {
  it('returns the safe message, code and reason of an application error', () => {
    const shape = formatApiError(
      toTRPCError(new AppError('FORBIDDEN', { reason: 'EMAIL_NOT_VERIFIED' })),
      { path: 'account.me', requestId: 'req_1' },
    );

    expect(shape).toEqual({
      message: 'You do not have access to this.',
      code: -32003,
      data: {
        code: 'FORBIDDEN',
        httpStatus: 403,
        path: 'account.me',
        appCode: 'FORBIDDEN',
        reason: 'EMAIL_NOT_VERIFIED',
        requestId: 'req_1',
      },
    });
  });

  it('never exposes internal messages or stack traces', () => {
    const error = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      cause: new Error('internal detail: database host unreachable'),
    });
    const shape = formatApiError(error);

    expect(shape.message).toBe('Something went wrong. Please try again.');
    expect(shape.data.appCode).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(shape)).not.toContain('internal detail');
    expect(shape.data).not.toHaveProperty('stack');
  });

  it('uses the first validation message for invalid input', () => {
    const error = new TRPCError({
      code: 'BAD_REQUEST',
      cause: Object.assign(new Error('Invalid input'), {
        issues: [{ message: 'Enter your name.' }],
      }),
    });

    expect(formatApiError(error)).toMatchObject({
      message: 'Enter your name.',
      data: { appCode: 'VALIDATION_ERROR' },
    });
  });
});
