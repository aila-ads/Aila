import { randomUUID } from 'node:crypto';
import { clientIpFrom, resolveAccountContext, withinRateLimits } from '@aila/auth/server';
import { AppError, isAppError, writerAssistSchema } from '@aila/validation';
import { apiErrorResponse } from '../api/errors';
import { assist, type AssistEvent } from './assist';

/** Largest request body: a full selection, earlier text and instructions, plus JSON. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * POST /api/writer/assist: runs a Writer AI operation and streams the
 * suggestion as newline-delimited JSON events (WRITER §16, §44). Same
 * origin only, limited per IP; the account always comes from the session.
 * Errors before the stream starts use the API's JSON error shape; later
 * errors arrive as an `error` event. A closed connection cancels the AI.
 */
export async function handleAssist(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId };
  const fail = (error: AppError) => apiErrorResponse(error, requestId, headers);

  const origin = request.headers.get('origin');

  if (origin === null || origin !== new URL(request.url).origin) {
    return fail(new AppError('FORBIDDEN', { reason: 'CROSS_ORIGIN' }));
  }

  if (!(await withinRateLimits([['apiPerIp', clientIpFrom(request.headers)]]))) {
    return fail(new AppError('RATE_LIMITED'));
  }

  const tooLong = () => new AppError('VALIDATION_ERROR', { message: 'This request is too long. Select less text.' });

  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
    return fail(tooLong());
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > MAX_BODY_BYTES) {
      return fail(tooLong());
    }

    body = JSON.parse(raw);
  } catch {
    return fail(new AppError('VALIDATION_ERROR'));
  }

  const parsed = writerAssistSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return fail(new AppError('VALIDATION_ERROR', message && message.length <= 200 ? { message } : {}));
  }

  let events: AsyncGenerator<AssistEvent>;

  try {
    const ctx = await resolveAccountContext({ requestId });
    events = await assist(ctx, parsed.data, { requestId, signal: request.signal });
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === 'INTERNAL_ERROR' || error.code === 'DEPENDENCY_FAILURE') {
        console.error('[writer] Assist request failed', { requestId, code: error.code, reason: error.reason ?? null });
      }
      return fail(error);
    }

    console.error('[writer] Assist request failed', {
      requestId,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    return fail(new AppError('INTERNAL_ERROR'));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();

        if (next.done) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch {
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
