import { handleSendMessage } from '../../../../server/intelligence/send-route';

export const dynamic = 'force-dynamic';
// Long enough for a reasoning reply (AI-GATEWAY §22: 240 seconds).
export const maxDuration = 300;

/** Aila Intelligence: send a message and stream the reply. */
export function POST(request: Request): Promise<Response> {
  return handleSendMessage(request);
}
