import { randomUUID } from 'node:crypto';
import { clientIpFrom, resolveAccountContext, withinRateLimits } from '@aila/auth/server';
import { AppError, isAppError } from '@aila/validation';
import { apiErrorResponse } from '../api/errors';
import { MAX_AUDIO_BYTES, transcribe } from './transcribe';

const TOO_LARGE = 'Recordings can be up to 2 minutes.';

/** The request body, or null when it is larger than `limit` bytes. */
async function readBody(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

/**
 * POST /api/intelligence/transcribe: turns a voice recording (16-bit PCM
 * WAV, made in the browser) into text that the person can edit before
 * sending. Same-origin only (SECURITY-ARCHITECTURE §9.4), limited per IP,
 * the account always comes from the session, and the body is capped
 * before it is read in full. Answers `{ text }` or the API's JSON error.
 */
export async function handleTranscribe(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId };
  const fail = (error: AppError) => apiErrorResponse(error, requestId, headers);

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');

  if (
    origin === null ||
    origin !== new URL(request.url).origin ||
    (fetchSite !== null && fetchSite !== 'same-origin')
  ) {
    return fail(new AppError('FORBIDDEN', { reason: 'CROSS_ORIGIN' }));
  }

  if (!(await withinRateLimits([['apiPerIp', clientIpFrom(request.headers)]]))) {
    return fail(new AppError('RATE_LIMITED'));
  }

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();

  if (contentType !== 'audio/wav') {
    return fail(new AppError('VALIDATION_ERROR', { reason: 'INVALID_AUDIO', message: 'Send a WAV recording.' }));
  }

  const declared = Number(request.headers.get('content-length') ?? '0');

  if (declared > MAX_AUDIO_BYTES) {
    return fail(new AppError('VALIDATION_ERROR', { reason: 'AUDIO_TOO_LARGE', message: TOO_LARGE }));
  }

  try {
    const ctx = await resolveAccountContext({ requestId });
    const audio = await readBody(request, MAX_AUDIO_BYTES);

    if (!audio) {
      return fail(new AppError('VALIDATION_ERROR', { reason: 'AUDIO_TOO_LARGE', message: TOO_LARGE }));
    }

    const result = await transcribe(ctx, audio, { requestId, signal: request.signal });
    return Response.json(result, { status: 200, headers });
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === 'INTERNAL_ERROR' || error.code === 'DEPENDENCY_FAILURE') {
        console.error('[intelligence] Transcription failed', { requestId, code: error.code, reason: error.reason ?? null });
      }
      return fail(error);
    }

    console.error('[intelligence] Transcription failed', {
      requestId,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    return fail(new AppError('INTERNAL_ERROR'));
  }
}
