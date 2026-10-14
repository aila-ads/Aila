'use client';

import { useId, useRef, useState } from 'react';
import { LoaderCircle, Paperclip, XIcon } from 'lucide-react';
import {
  FILE_ACCEPT,
  FILE_TYPE_LABELS,
  FILE_TYPES_LABEL,
  INTELLIGENCE_MAX_FILES,
  fileExtension,
} from '@aila/validation';
import { uploadFile, uploadProblem } from '../../lib/uploads';
import { Button } from '../ui/button';

export type AttachableFile = { readonly id: string; readonly name: string; readonly type: string };

/**
 * Files for the next message (PRODUCT-SPEC §10.4): upload a new one with
 * the paperclip, or pick from the account's Files. Up to three; the
 * server checks every file again when the message is sent.
 */
export function Attachments({
  files,
  selected,
  disabled,
  onChange,
  onUploadingChange,
  onError,
}: {
  files: readonly AttachableFile[];
  selected: readonly AttachableFile[];
  disabled: boolean;
  onChange: (next: readonly AttachableFile[]) => void;
  onUploadingChange: (uploading: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const full = selected.length >= INTELLIGENCE_MAX_FILES;
  const isSelected = (fileId: string) => selected.some((file) => file.id === fileId);

  async function upload(file: File) {
    onError(null);
    const problem = uploadProblem(file);

    if (problem) {
      onError(problem);
      return;
    }

    setUploading(file.name);
    onUploadingChange(true);

    try {
      const result = await uploadFile(file);

      if (!result.ok) {
        onError(result.message);
        return;
      }

      const label = FILE_TYPE_LABELS[result.mimeType] ?? fileExtension(file.name)?.toUpperCase() ?? '';
      onChange([...selected, { id: result.fileId, name: file.name, type: label }].slice(0, INTELLIGENCE_MAX_FILES));
    } finally {
      setUploading(null);
      onUploadingChange(false);
      if (input.current) {
        input.current.value = '';
      }
    }
  }

  function toggle(file: AttachableFile) {
    if (isSelected(file.id)) {
      onChange(selected.filter((item) => item.id !== file.id));
    } else if (!full) {
      onChange([...selected, file]);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          id={`${id}-input`}
          type="file"
          accept={FILE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled || full || uploading !== null}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void upload(file);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || full || uploading !== null}
          onClick={() => input.current?.click()}
          aria-label={`Attach a file (${FILE_TYPES_LABEL}, up to 25 MB)`}
          aria-describedby={`${id}-help`}
          title="Attach a file"
        >
          <Paperclip aria-hidden="true" />
        </Button>
        {files.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={browsing}
            aria-controls={`${id}-files`}
            onClick={() => setBrowsing((open) => !open)}
            className="label-caps text-muted-foreground"
          >
            From your files
          </Button>
        ) : null}
        <span id={`${id}-help`} className="sr-only">
          Up to {INTELLIGENCE_MAX_FILES} files: {FILE_TYPES_LABEL}, up to 25 MB each.
        </span>
      </div>

      {selected.length > 0 || uploading ? (
        <ul aria-label="Attached files" className="flex flex-wrap gap-2">
          {selected.map((file) => (
            <li
              key={file.id}
              className="flex max-w-full items-center gap-2 border border-brass/60 bg-secondary py-1 pr-1 pl-3 text-sm"
            >
              <span className="label-caps text-brass-ink">{file.type}</span>
              <span className="max-w-[14rem] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((item) => item.id !== file.id))}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                className="inline-flex size-7 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
          {uploading ? (
            <li
              role="status"
              aria-live="polite"
              className="flex max-w-full items-center gap-2 border border-dashed border-brass/60 px-3 py-1 text-sm text-muted-foreground"
            >
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              <span className="max-w-[14rem] truncate">Uploading {uploading}…</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {browsing && files.length > 0 ? (
        <fieldset id={`${id}-files`} className="grid max-h-56 gap-2 overflow-y-auto border p-3">
          <legend className="px-1 text-sm text-muted-foreground">
            Choose up to {INTELLIGENCE_MAX_FILES} files from your Files.
          </legend>
          {files.map((file) => (
            <label key={file.id} className="flex items-center gap-2 text-sm tracking-normal text-foreground normal-case">
              <input
                type="checkbox"
                checked={isSelected(file.id)}
                disabled={disabled || (!isSelected(file.id) && full)}
                onChange={() => toggle(file)}
                className="size-4 accent-primary"
              />
              <span className="truncate">{file.name}</span>
              <span className="label-caps text-brass-ink">{file.type}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
