import { handleAssist } from '../../../../server/writer/assist-route';

export const dynamic = 'force-dynamic';
// Long enough for a reasoning reply (AI-GATEWAY §22: 240 seconds).
export const maxDuration = 300;

/** Aila Writer: run an AI writing operation and stream the suggestion. */
export function POST(request: Request): Promise<Response> {
  return handleAssist(request);
}
