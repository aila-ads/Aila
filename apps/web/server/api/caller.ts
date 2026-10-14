import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { TRPCError } from '@trpc/server';
import { AUTH_MESSAGES } from '@aila/auth';
import { isAppError, type AppError } from '@aila/validation';
import { createCaller } from './root';
import { createApiContext } from './trpc';

type ServerApi = ReturnType<typeof createCaller>;

/**
 * Server-side API caller for Server Components. Created once per render,
 * so the session and account are resolved once per request.
 */
export const getServerApi = cache((): ServerApi => createCaller(createApiContext(randomUUID())));

function appErrorOf(error: unknown): AppError | null {
  if (error instanceof TRPCError && isAppError(error.cause)) {
    return error.cause;
  }

  return isAppError(error) ? error : null;
}

export type PageData<T> = { readonly data: T } | { readonly error: string };

/**
 * Loads data for a signed-in page. Signed-out users go to sign-in,
 * unverified users to email verification; restricted or unavailable
 * accounts get a safe message instead of the page.
 */
export async function loadPageData<T>(
  pagePath: string,
  load: (api: ServerApi) => Promise<T>,
): Promise<PageData<T>> {
  let failure: AppError | null;

  try {
    return { data: await load(getServerApi()) };
  } catch (error) {
    failure = appErrorOf(error);

    if (!failure || failure.code === 'INTERNAL_ERROR') {
      console.error('[api] Page data failed to load', {
        page: pagePath,
        code: error instanceof TRPCError ? error.code : 'UNEXPECTED',
      });
    }
  }

  if (failure?.code === 'UNAUTHENTICATED') {
    redirect(`/login?redirect=${encodeURIComponent(pagePath)}`);
  }

  if (failure?.reason === 'EMAIL_NOT_VERIFIED') {
    redirect('/verify-email');
  }

  return {
    error:
      failure?.reason === 'ACCOUNT_RESTRICTED'
        ? AUTH_MESSAGES.accountRestricted
        : AUTH_MESSAGES.accountUnavailable,
  };
}
