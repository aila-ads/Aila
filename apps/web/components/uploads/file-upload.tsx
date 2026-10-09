'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FILE_ACCEPT,
  FILE_TYPES_LABEL,
  MAX_FILE_BYTES,
  resolveFileType,
} from '@aila/validation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly name: string }
  | { readonly kind: 'done'; readonly name: string }
  | { readonly kind: 'error'; readonly message: string };

const UPLOAD_FAILED = 'The upload did not finish. Check your connection and try again.';

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
    if (!resolveFileType(file.name, file.type)) {
      setStatus({ kind: 'error', message: `Upload a ${FILE_TYPES_LABEL} file.` });
      return;
    }

    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setStatus({ kind: 'error', message: file.size === 0 ? 'The file is empty.' : 'Files can be up to 25 MB.' });
      return;
    }

    setStatus({ kind: 'uploading', name: file.name });

    try {
      const ticket = await api.files.createUpload.mutate({
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      let response: Response;

      try {
        response = await fetch(ticket.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': ticket.contentType },
          body: file,
        });
      } catch {
        setStatus({ kind: 'error', message: UPLOAD_FAILED });
        return;
      }

      if (!response.ok) {
        setStatus({ kind: 'error', message: UPLOAD_FAILED });
        return;
      }

      await api.files.completeUpload.mutate({ fileId: ticket.fileId });
      setStatus({ kind: 'done', name: file.name });
      onUploaded?.(ticket.fileId);
      router.refresh();
    } catch (error) {
      setStatus({ kind: 'error', message: apiErrorMessage(error) });
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
