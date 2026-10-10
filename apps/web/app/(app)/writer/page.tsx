import type { Metadata } from 'next';
import { PageError } from '../../../components/account/page-error';
import { WriterHome } from '../../../components/writer/writer-home';
import { loadWriterHome } from './load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Writer · Aila' };

/** Aila Writer home: projects, a new project and search (WRITER §6, AILA-V1-SCOPE §9). */
export default async function WriterPage() {
  const result = await loadWriterHome();

  if ('error' in result) {
    return <PageError title="Aila Writer" message={result.error} retryHref="/writer" />;
  }

  return <WriterHome {...result.data} />;
}
