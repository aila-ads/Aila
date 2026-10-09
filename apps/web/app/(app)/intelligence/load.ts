import { TRPCError } from '@trpc/server';
import { notFound } from 'next/navigation';
import { isAppError } from '@aila/validation';
import type { IntelligenceData } from '../../../components/intelligence/intelligence-view';
import { loadPageData, type PageData } from '../../../server/api/caller';

const TEXT_TYPES: Record<string, string> = { 'text/plain': 'TXT', 'text/csv': 'CSV' };

function isNotFound(error: unknown): boolean {
  const cause = error instanceof TRPCError ? error.cause : error;
  return isAppError(cause) && cause.code === 'NOT_FOUND';
}

/** Server data for the Intelligence pages; access is decided on the server. */
export async function loadIntelligence(
  pagePath: string,
  conversationId: string | null,
): Promise<PageData<IntelligenceData>> {
  let missing = false;
  const result = await loadPageData(pagePath, async (api) => {
    const [overview, conversations, entitlements, trial, files, conversation] = await Promise.all([
      api.account.me(),
      api.intelligence.list(),
      api.account.entitlements(),
      api.account.trial(),
      api.files.list(),
      conversationId
        ? api.intelligence.get({ conversationId }).catch((error: unknown) => {
            if (isNotFound(error)) {
              missing = true;
              return null;
            }
            throw error;
          })
        : Promise.resolve(null),
    ]);

    const formatDate = new Intl.DateTimeFormat(overview.settings.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: overview.settings.timezone,
    });

    return {
      conversations: conversations.map((item) => ({
        id: item.id,
        title: item.title,
        updated: formatDate.format(new Date(item.updatedAt)),
      })),
      conversation: conversation
        ? { id: conversation.id, title: conversation.title, messages: conversation.messages }
        : null,
      canSend: entitlements.keys.includes('intelligence'),
      advancedModels: entitlements.keys.includes('advanced_models'),
      files: files.flatMap((file) =>
        TEXT_TYPES[file.mimeType] ? [{ id: file.id, name: file.name, type: TEXT_TYPES[file.mimeType]! }] : [],
      ),
      trial,
      granted: entitlements.source === 'GRANT',
    } satisfies IntelligenceData;
  });

  if (missing) {
    notFound();
  }

  return result;
}
