import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../server/api/root';

/** Browser client for the application API. Cookies are sent same-origin only. */
export const api = createTRPCClient<AppRouter>({
  links: [httpLink({ url: '/api/trpc' })],
});

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** A safe, user-facing message for any failed API call. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof TRPCClientError && typeof error.message === 'string' && error.message
    ? error.message
    : FALLBACK_MESSAGE;
}

/** The application error code of a failed API call, if any. */
export function apiErrorCode(error: unknown): string | null {
  if (error instanceof TRPCClientError) {
    const data: unknown = error.data;
    const appCode: unknown =
      typeof data === 'object' && data !== null ? Reflect.get(data, 'appCode') : null;
    return typeof appCode === 'string' ? appCode : null;
  }

  return null;
}
