import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { writerProjectIdSchema } from '@aila/validation';
import { PageError } from '../../../../components/account/page-error';
import { ProjectView } from '../../../../components/writer/project-view';
import { loadWriterProject } from '../load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Writer project · Aila' };

/** A Writer project, readable only by its account (AC-070, AC-071). */
export default async function WriterProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const parsed = writerProjectIdSchema.safeParse(await params);

  if (!parsed.success) {
    notFound();
  }

  const path = `/writer/${parsed.data.projectId}`;
  const result = await loadWriterProject(parsed.data.projectId);

  if ('error' in result) {
    return <PageError title="Aila Writer" message={result.error} retryHref={path} />;
  }

  return <ProjectView {...result.data} />;
}
