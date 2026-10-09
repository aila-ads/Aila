import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { conversationIdSchema } from '@aila/validation';
import { PageError } from '../../../../components/account/page-error';
import { IntelligenceView } from '../../../../components/intelligence/intelligence-view';
import { loadIntelligence } from '../load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Intelligence · Aila' };

/** One conversation, readable only by its account (AC-060, AC-062). */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const parsed = conversationIdSchema.safeParse(await params);

  if (!parsed.success) {
    notFound();
  }

  const path = `/intelligence/${parsed.data.conversationId}`;
  const result = await loadIntelligence(path, parsed.data.conversationId);

  if ('error' in result) {
    return <PageError title="Aila Intelligence" message={result.error} retryHref={path} />;
  }

  return <IntelligenceView {...result.data} />;
}
