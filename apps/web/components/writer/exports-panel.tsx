'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  WRITER_EXPORT_FORMATS,
  WRITER_NODE_KIND_LABELS,
  type WriterExportFormat,
  type WriterNodeKind,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ErrorNotice, useAction } from './common';

export type ExportEntry = {
  readonly id: string;
  readonly format: WriterExportFormat;
  readonly status: 'PROCESSING' | 'READY' | 'FAILED';
  readonly fileName: string;
  readonly sizeBytes: number | null;
  readonly nodeId: string | null;
  readonly created: string;
};

const FORMAT_LABELS: Readonly<Record<WriterExportFormat, string>> = {
  PDF: 'PDF',
  DOCX: 'Word (DOCX)',
  EPUB: 'EPUB e-book',
};

const STATUS_LABELS = { PROCESSING: 'Preparing', READY: 'Ready', FAILED: 'Failed' } as const;

function size(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024 * 1024) return ` · ${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
  return ` · ${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

function ExportRow({ item, scope }: { item: ExportEntry; scope: string }) {
  const router = useRouter();
  const { pending, error, run } = useAction();

  return (
    <li className="grid gap-2 border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words">
          <span className="font-medium">{item.fileName}</span>
          <span className="text-sm text-muted-foreground">
            {' '}
            · {scope}
            {size(item.sizeBytes)} · {item.created}
          </span>
        </span>
        <Badge variant={item.status === 'READY' ? 'default' : 'outline'}>{STATUS_LABELS[item.status]}</Badge>
      </div>
      {item.status === 'FAILED' ? (
        <p className="text-sm text-muted-foreground">This export did not finish. Your writing is unchanged; try again.</p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {item.status === 'READY' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const { url } = await api.writer.exports.download.mutate({ exportId: item.id });
                window.location.assign(url);
              })
            }
          >
            Download
          </Button>
        ) : null}
        {item.status !== 'PROCESSING' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => api.writer.exports.delete.mutate({ exportId: item.id }), () => router.refresh())}
            aria-label={`Delete export ${item.fileName}`}
          >
            Delete
          </Button>
        ) : null}
      </div>
      <ErrorNotice error={error} />
    </li>
  );
}

/** Export to PDF, DOCX or EPUB (WRITER §31-33). The writing itself is never changed by an export. */
export function ExportsPanel({
  projectId,
  exports,
  outline,
  canExport,
}: {
  projectId: string;
  exports: readonly ExportEntry[];
  outline: readonly { readonly id: string; readonly kind: WriterNodeKind; readonly title: string; readonly depth: number }[];
  /** Server-resolved `writer` entitlement; display only. */
  canExport: boolean;
}) {
  const router = useRouter();
  const [format, setFormat] = useState<WriterExportFormat>('PDF');
  const [nodeId, setNodeId] = useState('');
  const { pending, error, run } = useAction();
  const titles = new Map(outline.map((node) => [node.id, `${WRITER_NODE_KIND_LABELS[node.kind]} “${node.title}”`]));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        api.writer.exports.create.mutate({
          projectId,
          format,
          requestKey: crypto.randomUUID(),
          ...(nodeId ? { nodeId } : {}),
        }),
      () => router.refresh(),
    );
  }

  return (
    <div className="grid gap-4">
      {canExport ? (
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="export-format">Format</label>
              <select
                id="export-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as WriterExportFormat)}
              >
                {WRITER_EXPORT_FORMATS.map((option) => (
                  <option key={option} value={option}>
                    {FORMAT_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="export-scope">What to export</label>
              <select id="export-scope" value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
                <option value="">The whole project</option>
                {outline.map((node) => (
                  <option key={node.id} value={node.id}>
                    {'— '.repeat(node.depth)}
                    {titles.get(node.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="submit" className="w-fit" disabled={pending || outline.length === 0}>
            {pending ? 'Preparing export…' : 'Export'}
          </Button>
          {pending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Preparing your file. Long works can take a moment.
            </p>
          ) : null}
          {outline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a chapter before exporting.</p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">New exports need Aila Pro. Earlier exports stay available.</p>
      )}
      <ErrorNotice error={error} />
      {exports.length > 0 ? (
        <ul className="grid gap-2" aria-label="Exports">
          {exports.map((item) => (
            <ExportRow
              key={`${item.id}:${item.status}`}
              item={item}
              scope={item.nodeId ? (titles.get(item.nodeId) ?? 'A removed part') : 'Whole project'}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
