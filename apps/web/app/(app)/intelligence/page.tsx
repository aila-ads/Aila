import type { Metadata } from 'next';
import { PageError } from '../../../components/account/page-error';
import { IntelligenceView } from '../../../components/intelligence/intelligence-view';
import { loadIntelligence } from './load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Intelligence · Aila' };

/** Aila Intelligence: history and a new conversation (AILA-V1-SCOPE §7). */
export default async function IntelligencePage() {
  const result = await loadIntelligence('/intelligence', null);

  if ('error' in result) {
    return <PageError title="Aila Intelligence" message={result.error} retryHref="/intelligence" />;
  }

  return <IntelligenceView {...result.data} />;
}
