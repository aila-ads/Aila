import { randomUUID } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { clientIpFrom, withinRateLimits } from '@aila/auth/server';
import { AppError, isAppError } from '@aila/validation';
import { apiErrorResponse } from '../../../../server/api/errors';
import { appRouter } from '../../../../server/api/root';
import { createApiContext } from '../../../../server/api/trpc';

export const dynamic = 'force-dynamic';

/**
 * Application API endpoint (APPLICATION-ARCHITECTURE §22). Writes are only
 * accepted from this site's own pages (SECURITY-ARCHITECTURE §9.4), and
 * every request is limited per IP address.
 */
async function handler(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId };

  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');

    if (origin === null || origin !== new URL(request.url).origin) {
      return apiErrorResponse(
        new AppError('FORBIDDEN', { reason: 'CROSS_ORIGIN' }),
        requestId,
        headers,
      );
    }
  }

  if (!(await withinRateLimits([['apiPerIp', clientIpFrom(request.headers)]]))) {
    return apiErrorResponse(new AppError('RATE_LIMITED'), requestId, headers);
  }

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => createApiContext(requestId),
    responseMeta: () => ({ headers }),
    onError: ({ error, path }) => {
      const appCode = isAppError(error.cause) ? error.cause.code : null;

      if (error.code === 'INTERNAL_SERVER_ERROR' || appCode === 'DEPENDENCY_FAILURE') {
        console.error('[api] Request failed', {
          requestId,
          path,
          code: error.code,
          cause: error.cause?.name ?? null,
        });
      }
    },
  });
}

export { handler as GET, handler as POST };
