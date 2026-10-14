import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  resolveAccountContext: vi.fn(),
  withinRateLimits: vi.fn(),
  requireEntitlement: vi.fn(),
}));
const ai = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../../../packages/auth/src/server-entry.ts', () => ({
  clientIpFrom: () => '203.0.113.1',
  resolveAccountContext: auth.resolveAccountContext,
  withinRateLimits: auth.withinRateLimits,
  requireEntitlement: auth.requireEntitlement,
}));
vi.mock('../../../packages/ai/src/index.ts', () => ({ generate: ai.generate }));

const { handleTranscribe } = await import('../../../apps/web/server/intelligence/transcribe-route');
const { MAX_AUDIO_BYTES, parseWav } = await import('../../../apps/web/server/intelligence/transcribe');
const { encodeWav } = await import('../../../apps/web/lib/audio');
const { AppError } = await import('../../../packages/validation/src/errors');

const ORIGIN = 'https://ailaxx.com';
const ctx = { account: { id: 'acct_1' }, user: { id: 'user_1' } };
const wav = (seconds: number, rate = 16_000) => encodeWav(new Float32Array(Math.round(seconds * rate)), rate);

function post(
  body: BodyInit | null = wav(2) as BodyInit,
  headers: Record<string, string> = {},
  origin: string | null = ORIGIN,
) {
  return new Request(`${ORIGIN}/api/intelligence/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', ...(origin ? { Origin: origin } : {}), ...headers },
    body,
  });
}

async function errorOf(response: Response) {
  const json = (await response.json()) as { error: { message: string; data: { appCode: string } } };
  return { status: response.status, appCode: json.error.data.appCode, message: json.error.message };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  auth.withinRateLimits.mockResolvedValue(true);
  auth.resolveAccountContext.mockResolvedValue(ctx);
  auth.requireEntitlement.mockResolvedValue({ keys: ['intelligence'] });
  ai.generate.mockResolvedValue({ content: '  Kedu, Aila. Plan my launch.  ' });
});

describe('POST /api/intelligence/transcribe', () => {
  it('refuses cross-site, origin-less and cross-site-fetch requests', async () => {
    expect((await errorOf(await handleTranscribe(post(undefined, {}, 'https://evil.example')))).status).toBe(403);
    expect((await errorOf(await handleTranscribe(post(undefined, {}, null)))).status).toBe(403);
    expect((await errorOf(await handleTranscribe(post(undefined, { 'Sec-Fetch-Site': 'cross-site' })))).status).toBe(403);
    expect(auth.resolveAccountContext).not.toHaveBeenCalled();
  });

  it('applies the per-IP rate limit', async () => {
    auth.withinRateLimits.mockResolvedValue(false);
    expect(await errorOf(await handleTranscribe(post()))).toMatchObject({ status: 429, appCode: 'RATE_LIMITED' });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('accepts only WAV within the size cap', async () => {
    expect((await errorOf(await handleTranscribe(post(undefined, { 'Content-Type': 'audio/webm' })))).status).toBe(400);
    const declared = await errorOf(await handleTranscribe(post(undefined, { 'Content-Length': String(MAX_AUDIO_BYTES + 1) })));
    expect(declared).toMatchObject({ status: 400, message: 'Recordings can be up to 2 minutes.' });
    const streamed = await errorOf(await handleTranscribe(post(new Uint8Array(MAX_AUDIO_BYTES + 1) as BodyInit)));
    expect(streamed.message).toBe('Recordings can be up to 2 minutes.');
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('requires a session and the Intelligence entitlement', async () => {
    auth.resolveAccountContext.mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    expect(await errorOf(await handleTranscribe(post()))).toMatchObject({ status: 401 });
    auth.requireEntitlement.mockRejectedValueOnce(new AppError('TRIAL_EXPIRED'));
    expect(await errorOf(await handleTranscribe(post()))).toMatchObject({ appCode: 'TRIAL_EXPIRED' });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('rejects audio that is not a valid recording of the right length', async () => {
    for (const body of [new Uint8Array(100), wav(0.1), wav(126)]) {
      expect((await errorOf(await handleTranscribe(post(body as BodyInit)))).status).toBe(400);
    }
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('transcribes through the gateway with the transcribe capability and returns the text', async () => {
    const response = await handleTranscribe(post());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ text: 'Kedu, Aila. Plan my launch.' });
    const [calledCtx, request] = ai.generate.mock.calls[0]!;
    expect(calledCtx).toBe(ctx);
    expect(request).toMatchObject({ product: 'intelligence', capability: 'transcribe' });
    expect(request.messages[0].content).toContain('Do not translate');
    expect(request.messages[1].content[1].input_audio.format).toBe('wav');
  });

  it('says so when no speech was heard', async () => {
    ai.generate.mockResolvedValue({ content: '[no speech]' });
    expect((await errorOf(await handleTranscribe(post()))).message).toContain('didn’t catch any speech');
  });
});

describe('parseWav', () => {
  it('reads the recording length from the browser encoder', () => {
    expect(parseWav(wav(2))).toEqual({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, seconds: 2 });
    expect(parseWav(new TextEncoder().encode('RIFF....WAVEjunk'.padEnd(64, ' ')))).toBeNull();
  });
});
