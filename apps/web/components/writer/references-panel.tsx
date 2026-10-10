'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { WRITER_MAX_REFERENCES } from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { uploadFile } from '../../lib/uploads';
import { Button } from '../ui/button';
import { ErrorNotice, useAction } from './common';

/** Documents Aila can read text from (the image types in Files are not references). */
const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.csv';

export type ReferenceEntry = { readonly fileId: string; readonly name: string; readonly type: string; readonly sizeBytes: number };
export type AttachableDocument = { readonly id: string; readonly name: string; readonly type: string };

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

/**
 * Reference files (WRITER §25-26): documents from Files linked to the
 * project. Aila reads the ones chosen for an AI request; removing a
 * reference keeps the file in Files.
 */
export function ReferencesPanel({
  projectId,
  references,
  attachable,
  editable,
}: {
  projectId: string;
  references: readonly ReferenceEntry[];
  attachable: readonly AttachableDocument[];
  editable: boolean;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState('');
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const { pending, error, setError, run } = useAction();
  const full = references.length >= WRITER_MAX_REFERENCES;

  async function upload(file: File) {
    setError(null);
    setUploading(true);

    try {
      const result = await uploadFile(file);

      if (!result.ok) {
        setError({ message: result.message, code: null });
        return;
      }

      run(() => api.writer.references.attach.mutate({ projectId, fileId: result.fileId }), () => router.refresh());
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="grid gap-4">
      {references.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Attach PDF, Word, text or CSV documents that Aila can read when you ask for help.
        </p>
      ) : (
        <ul className="grid gap-2">
          {references.map((reference) => (
            <li key={reference.fileId} className="flex flex-wrap items-center justify-between gap-2 border p-3">
              <span className="min-w-0 break-words">
                {reference.name}
                <span className="text-sm text-muted-foreground">
                  {' '}
                  · {reference.type} · {size(reference.sizeBytes)}
                </span>
              </span>
              {editable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => api.writer.references.detach.mutate({ projectId, fileId: reference.fileId }),
                      () => router.refresh(),
                    )
                  }
                  aria-label={`Remove ${reference.name} from this project`}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editable && !full ? (
        <div className="grid gap-3">
          {attachable.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <label htmlFor="reference-file">Attach from Files</label>
                <select id="reference-file" value={choice} onChange={(event) => setChoice(event.target.value)}>
                  <option value="">Choose a document</option>
                  {attachable.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name} ({file.type})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!choice || pending}
                onClick={() =>
                  run(
                    () => api.writer.references.attach.mutate({ projectId, fileId: choice }),
                    () => {
                      setChoice('');
                      router.refresh();
                    },
                  )
                }
              >
                Attach
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              id="reference-upload"
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button size="sm" variant="outline" disabled={uploading || pending} onClick={() => input.current?.click()}>
              {uploading ? 'Uploading…' : 'Upload a document'}
            </Button>
            <Link href="/files" className="text-sm text-primary underline decoration-brass underline-offset-4">
              Manage files
            </Link>
          </div>
        </div>
      ) : null}
      {editable && full ? (
        <p className="text-sm text-muted-foreground">
          A project can have up to {WRITER_MAX_REFERENCES} reference files.
        </p>
      ) : null}
      <ErrorNotice error={error} />
    </div>
  );
}
