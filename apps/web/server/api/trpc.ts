import { initTRPC } from '@trpc/server';
import {
  resolveAccountContext,
  withinRateLimits,
  type AccountContext,
} from '@aila/auth/server';
import { AppError, isAppError } from '@aila/validation';
import { formatApiError, toTRPCError } from './errors';

/**
 * tRPC foundation (APPLICATION-ARCHITECTURE §13, §22; PLATFORM-FOUNDATION
 * §35-36). Every procedure is authenticated: there is no public procedure.
 * The account context is resolved on the server from the session, never
 * from client input.
 */

export type ApiContext = {
  readonly requestId: string;
  readonly resolveAccount: () => Promise<AccountContext>;
};

export function createApiContext(requestId: string): ApiContext {
  let account: Promise<AccountContext> | undefined;

  return {
    requestId,
    resolveAccount: () => (account ??= resolveAccountContext({ requestId })),
  };
}

const t = initTRPC.context<ApiContext>().create({
  errorFormatter: ({ error, path, ctx }) =>
    formatApiError(error, { path, requestId: ctx?.requestId }),
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Converts application errors into API errors with the matching status. */
const applicationErrors = t.middleware(async ({ next }) => {
  const result = await next();

  if (!result.ok && isAppError(result.error.cause)) {
    throw toTRPCError(result.error.cause);
  }

  return result;
});

/** Requires a signed-in, active user with an active account. */
const authenticated = t.middleware(async ({ ctx, next }) => {
  const auth = await ctx.resolveAccount();
  return next({ ctx: { ...ctx, auth } });
});

/** Writes are limited per account (SECURITY-ARCHITECTURE §10). */
const mutationRateLimit = t.middleware(async ({ ctx, next, type }) => {
  if (type === 'mutation') {
    const auth = await ctx.resolveAccount();

    if (!(await withinRateLimits([['apiMutationPerAccount', auth.account.id]]))) {
      throw new AppError('RATE_LIMITED');
    }
  }

  return next();
});

export const protectedProcedure = t.procedure
  .use(applicationErrors)
  .use(authenticated)
  .use(mutationRateLimit);
