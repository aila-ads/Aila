import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { writerNodeIdSchema, writerProjectIdSchema } from '@aila/validation';
import { PageError } from '../../../../../components/account/page-error';
import { EditorView } from '../../../../../components/writer/editor-view';
import { loadWriterEditor } from '../../load';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Writer editor · Aila' };

/** The editor for one document, part, chapter or section (AC-072, AC-073). */
export default async function WriterEditorPage({
  params,
}: {
  params: Promise<{ projectId: string; nodeId: string }>;
}) {
  const { projectId, nodeId } = await params;
  const project = writerProjectIdSchema.safeParse({ projectId });
  const node = writerNodeIdSchema.safeParse({ nodeId });

  if (!project.success || !node.success) {
    notFound();
  }

  const path = `/writer/${project.data.projectId}/${node.data.nodeId}`;
  const result = await loadWriterEditor(project.data.projectId, node.data.nodeId);

  if ('error' in result) {
    return <PageError title="Aila Writer" message={result.error} retryHref={path} />;
  }

  return <EditorView key={result.data.node.id} {...result.data} />;
}
