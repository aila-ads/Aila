'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FILE_ACCEPT, FILE_TYPES_LABEL } from '@aila/validation';
import { uploadFile, uploadProblem } from '../../lib/uploads';
import { Button } from '../ui/button';

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly name: string }
  | { readonly kind: 'done'; readonly name: string }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Reusable upload control (APPLICATION-ARCHITECTURE components/uploads).
 * The file goes straight to private storage through a short-lived signed
 * link; the server checks it before it becomes available.
 */
export function FileUpload({ onUploaded }: { onUploaded?: (fileId: string) => void }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function upload(file: File) {
    const problem = uploadProblem(file);

    if (problem) {
      setStatus({ kind: 'error', message: problem });
      return;
    }

    setStatus({ kind: 'uploading', name: file.name });

    try {
      const result = await uploadFile(file);

      if (!result.ok) {
        setStatus({ kind: 'error', message: result.message });
        return;
      }

      setStatus({ kind: 'done', name: file.name });
      onUploaded?.(result.fileId);
      router.refresh();
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  const uploading = status.kind === 'uploading';

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={FILE_ACCEPT}
          className="sr-only"
          disabled={uploading}
          aria-describedby={`${inputId}-help`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void upload(file);
            }
          }}
        />
        <Button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : 'Upload a file'}
        </Button>
        <p id={`${inputId}-help`} className="text-sm text-muted-foreground">
          {FILE_TYPES_LABEL}, up to 25 MB.
        </p>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
        {status.kind === 'uploading' ? `Uploading ${status.name}…` : null}
        {status.kind === 'done' ? `${status.name} was uploaded.` : null}
      </p>
      {status.kind === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
