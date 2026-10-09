import { randomUUID } from 'node:crypto';
import { clientIpFrom, resolveAccountContext, withinRateLimits } from '@aila/auth/server';
import { AppError, isAppError, sendMessageSchema } from '@aila/validation';
import { apiErrorResponse } from '../api/errors';
import { sendMessage, type TurnEvent } from './service';

/** Largest request body accepted: the message limit plus room for JSON. */
const MAX_BODY_BYTES = 128 * 1024;

/**
 * POST /api/intelligence/messages: sends a message and streams the reply as
 * newline-delimited JSON events (PRODUCT-SPEC §10.4, AI-GATEWAY §21).
 * Same-origin only (SECURITY-ARCHITECTURE §9.4), limited per IP, and the
 * account always comes from the session. Errors before the stream starts are
 * answered with the API's JSON error shape and status; later errors arrive
 * as an `error` event. A closed connection cancels the AI request.
 */
export async function handleSendMessage(request: Request): Promise<Response> {
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

  const declared = Number(request.headers.get('content-length') ?? '0');

  if (declared > MAX_BODY_BYTES) {
    return fail(new AppError('VALIDATION_ERROR', { message: 'This message is too long.' }));
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > MAX_BODY_BYTES) {
      return fail(new AppError('VALIDATION_ERROR', { message: 'This message is too long.' }));
    }

    body = JSON.parse(raw);
  } catch {
    return fail(new AppError('VALIDATION_ERROR'));
  }

  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return fail(new AppError('VALIDATION_ERROR', message && message.length <= 200 ? { message } : {}));
  }

  let events: AsyncGenerator<TurnEvent>;

  try {
    const ctx = await resolveAccountContext({ requestId });
    events = await sendMessage(ctx, parsed.data, { requestId, signal: request.signal });
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === 'INTERNAL_ERROR' || error.code === 'DEPENDENCY_FAILURE') {
        console.error('[intelligence] Request failed', { requestId, code: error.code, reason: error.reason ?? null });
      }
      return fail(error);
    }

    console.error('[intelligence] Request failed', {
      requestId,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    return fail(new AppError('INTERNAL_ERROR'));
  }

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();

        if (next.done) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch {
        // Never expected: the service turns failures into events.
        controller.close();
      }
    },
    async cancel() {
      // The browser went away: stop the AI and keep what was received.
      await events.return(undefined);
    },
  });

  return new Response(body$, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
