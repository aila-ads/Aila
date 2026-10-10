'use client';

import { useState, type FormEvent } from 'react';
import { WRITER_MAX_LABEL_CHARS } from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { AssistantMarkdown } from '../intelligence/markdown';
import { Button } from '../ui/button';
import { ErrorNotice, plural, useAction } from './common';

export type VersionEntry = {
  readonly id: string;
  readonly versionNumber: number;
  readonly source: 'MANUAL' | 'MILESTONE' | 'AI' | 'RESTORE';
  readonly label: string | null;
  readonly title: string;
  readonly wordCount: number;
  readonly created: string;
};

const SOURCE_LABELS: Readonly<Record<VersionEntry['source'], string>> = {
  MANUAL: 'Saved version',
  MILESTONE: 'Automatic milestone',
  AI: 'Before an AI suggestion',
  RESTORE: 'Before a restore',
};

type Restored = { readonly revision: number; readonly title: string; readonly content: string };

/**
 * Version history (WRITER §14-15): save a named version, view an earlier
 * one and restore it. Restoring first keeps the current text as a version,
 * so a restore can itself be undone.
 */
export function VersionsPanel({
  nodeId,
  versions,
  editable,
  dirty,
  revision,
  format,
  onSaveFirst,
  onRestored,
  onVersionsChange,
}: {
  nodeId: string;
  versions: readonly VersionEntry[];
  editable: boolean;
  /** Unsaved changes in the editor. */
  dirty: boolean;
  revision: number;
  format: (iso: string) => string;
  /** Saves pending changes; resolves false when that failed. */
  onSaveFirst: () => Promise<boolean>;
  onRestored: (result: Restored) => void;
  onVersionsChange: (versions: VersionEntry[]) => void;
}) {
  const [label, setLabel] = useState('');
  const [viewing, setViewing] = useState<{ id: string; content: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const { pending, error, setError, run } = useAction();

  async function reload() {
    const list = await api.writer.versions.list.query({ nodeId });
    onVersionsChange(list.map((version) => ({ ...version, created: format(version.createdAt) })));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      if (!(await onSaveFirst())) {
        setError({ message: 'Your latest changes are not saved yet, so no version was made. Try again.', code: null });
        return;
      }
      await api.writer.versions.create.mutate({ nodeId, ...(label.trim() ? { label } : {}) });
      setLabel('');
      await reload();
    });
  }

  function view(versionId: string) {
    run(async () => {
      const version = await api.writer.versions.get.query({ versionId });
      setViewing({ id: version.id, content: version.content, title: version.title });
    });
  }

  function restore(versionId: string) {
    run(async () => {
      const result = await api.writer.versions.restore.mutate({ versionId, baseRevision: revision });
      onRestored(result);
      setConfirm(null);
      setViewing(null);
      await reload();
    });
  }

  return (
    <div className="grid gap-4">
      {editable ? (
        <form onSubmit={save} className="grid gap-2">
          <label htmlFor="version-label">Version name (optional)</label>
          <div className="flex flex-wrap gap-2">
            <input
              id="version-label"
              value={label}
              maxLength={WRITER_MAX_LABEL_CHARS}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="For example: First full draft"
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={pending}>
              Save version
            </Button>
          </div>
        </form>
      ) : null}
      <ErrorNotice error={error} />

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No versions yet. Save one at any time; Aila also keeps one before each accepted AI suggestion and every 30
          minutes of writing.
        </p>
      ) : (
        <ol className="grid gap-2" aria-label="Versions">
          {versions.map((version) => (
            <li key={version.id} className="grid gap-2 border p-3">
              <p className="grid gap-0.5">
                <span className="font-medium">
                  Version {version.versionNumber}
                  {version.label ? `: ${version.label}` : ''}
                </span>
                <span className="text-sm text-muted-foreground">
                  {SOURCE_LABELS[version.source]} · {version.created} · {plural(version.wordCount, 'word', 'words')}
                </span>
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => (viewing?.id === version.id ? setViewing(null) : view(version.id))}
                  aria-expanded={viewing?.id === version.id}
                >
                  {viewing?.id === version.id ? 'Hide' : 'View'}
                </Button>
                {editable ? (
                  confirm === version.id ? (
                    <>
                      <Button size="sm" disabled={pending || dirty} onClick={() => restore(version.id)}>
                        {pending ? 'Restoring…' : 'Restore this version'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(version.id)}>
                      Restore…
                    </Button>
                  )
                ) : null}
              </div>
              {confirm === version.id ? (
                <p className="text-sm text-muted-foreground">
                  {dirty
                    ? 'Wait until your latest changes are saved, then restore.'
                    : 'The current text is kept as a version first, so you can return to it.'}
                </p>
              ) : null}
              {viewing?.id === version.id ? (
                <div className="max-h-96 overflow-y-auto border-t pt-3">
                  <p className="label-caps mb-2 text-brass-ink">{viewing.title}</p>
                  {viewing.content.trim() ? (
                    <AssistantMarkdown text={viewing.content} />
                  ) : (
                    <p className="text-sm text-muted-foreground">This version is empty.</p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
