import { handleTranscribe } from '../../../../server/intelligence/transcribe-route';

export const dynamic = 'force-dynamic';
// A two-minute recording plus the AI's time (AI-GATEWAY §22: 90 seconds).
export const maxDuration = 120;

/** Aila Intelligence: turn a voice recording into text. */
export function POST(request: Request): Promise<Response> {
  return handleTranscribe(request);
}
