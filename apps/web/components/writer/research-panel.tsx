'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  WRITER_MAX_CONTEXT_CHARS,
  WRITER_MAX_TITLE_CHARS,
  WRITER_MAX_URL_CHARS,
  WRITER_RESEARCH_KINDS,
  type WriterResearchKind,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ErrorNotice, fieldClass, useAction } from './common';

export type ResearchEntry = {
  readonly id: string;
  readonly kind: WriterResearchKind;
  readonly title: string;
  readonly body: string | null;
  readonly url: string | null;
  readonly sourceTitle: string | null;
  readonly updated: string;
};

export const RESEARCH_KIND_LABELS: Readonly<Record<WriterResearchKind, string>> = {
  QUESTION: 'Question',
  NOTE: 'Note',
  SOURCE: 'Source',
};

type Draft = { kind: WriterResearchKind; title: string; body: string; url: string; sourceTitle: string };

const EMPTY: Draft = { kind: 'NOTE', title: '', body: '', url: '', sourceTitle: '' };

function ResearchForm({
  initial,
  submitLabel,
  showKind,
  pending,
  onSubmit,
  onCancel,
  idPrefix,
}: {
  initial: Draft;
  submitLabel: string;
  showKind: boolean;
  pending: boolean;
  onSubmit: (draft: Draft) => void;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draft);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        {showKind ? (
          <div className="grid gap-1">
            <label htmlFor={`${idPrefix}-kind`}>Kind</label>
            <select
              id={`${idPrefix}-kind`}
              value={draft.kind}
              onChange={(event) => set({ kind: event.target.value as WriterResearchKind })}
            >
              {WRITER_RESEARCH_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {RESEARCH_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={showKind ? 'grid gap-1' : 'grid gap-1 sm:col-span-2'}>
          <label htmlFor={`${idPrefix}-title`}>Title</label>
          <input
            id={`${idPrefix}-title`}
            required
            value={draft.title}
            maxLength={WRITER_MAX_TITLE_CHARS}
            onChange={(event) => set({ title: event.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${idPrefix}-body`}>Notes</label>
        <textarea
          id={`${idPrefix}-body`}
          rows={3}
          value={draft.body}
          maxLength={WRITER_MAX_CONTEXT_CHARS}
          onChange={(event) => set({ body: event.target.value })}
          className={fieldClass}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label htmlFor={`${idPrefix}-url`}>Source link (optional)</label>
          <input
            id={`${idPrefix}-url`}
            type="url"
            value={draft.url}
            maxLength={WRITER_MAX_URL_CHARS}
            onChange={(event) => set({ url: event.target.value })}
            placeholder="https://"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${idPrefix}-source`}>Source title (optional)</label>
          <input
            id={`${idPrefix}-source`}
            value={draft.sourceTitle}
            maxLength={WRITER_MAX_TITLE_CHARS}
            onChange={(event) => set({ sourceTitle: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || !draft.title.trim()}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const optional = (value: string) => (value.trim() ? value : null);

function ResearchRow({ item, editable }: { item: ResearchEntry; editable: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const { pending, error, run } = useAction();

  return (
    <li className="grid gap-2 border p-3">
      {mode === 'edit' ? (
        <ResearchForm
          idPrefix={`research-${item.id}`}
          initial={{
            kind: item.kind,
            title: item.title,
            body: item.body ?? '',
            url: item.url ?? '',
            sourceTitle: item.sourceTitle ?? '',
          }}
          showKind={false}
          submitLabel="Save"
          pending={pending}
          onCancel={() => setMode('view')}
          onSubmit={(draft) =>
            run(
              () =>
                api.writer.research.update.mutate({
                  researchId: item.id,
                  title: draft.title,
                  body: optional(draft.body),
                  url: optional(draft.url),
                  sourceTitle: optional(draft.sourceTitle),
                }),
              () => {
                setMode('view');
                router.refresh();
              },
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{RESEARCH_KIND_LABELS[item.kind]}</Badge>
            <span className="font-medium">{item.title}</span>
          </div>
          {item.body ? <p className="text-sm break-words whitespace-pre-wrap">{item.body}</p> : null}
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm break-all text-primary underline decoration-brass underline-offset-4"
            >
              {item.sourceTitle ?? item.url}
            </a>
          ) : item.sourceTitle ? (
            <p className="text-sm text-muted-foreground">{item.sourceTitle}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">Updated {item.updated}</p>
          {editable ? (
            <div className="flex flex-wrap gap-1">
              {mode === 'delete' ? (
                <>
                  <Button
                    size="sm"
                    disabled={pending}
                    className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                    onClick={() => run(() => api.writer.research.delete.mutate({ researchId: item.id }), () => router.refresh())}
                  >
                    {pending ? 'Deleting…' : 'Delete'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMode('view')}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setMode('delete')}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
      <ErrorNotice error={error} />
    </li>
  );
}

/** Research questions, notes and sources for the project (WRITER §24). */
export function ResearchPanel({
  projectId,
  items,
  editable,
}: {
  projectId: string;
  items: readonly ResearchEntry[];
  editable: boolean;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const { pending, error, run } = useAction();

  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keep research questions, notes and sources here. Sources found by Aila’s research assistance can be saved
          from the editor.
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <ResearchRow key={`${item.id}:${item.updated}`} item={item} editable={editable} />
          ))}
        </ul>
      )}
      {editable ? (
        <details className="grid gap-3 border border-dashed p-3">
          <summary className="label-caps cursor-pointer text-muted-foreground">Add research</summary>
          <div className="pt-3">
            <ResearchForm
              key={formKey}
              idPrefix="research-new"
              initial={EMPTY}
              showKind
              submitLabel="Add"
              pending={pending}
              onSubmit={(draft) =>
                run(
                  () =>
                    api.writer.research.create.mutate({
                      projectId,
                      kind: draft.kind,
                      title: draft.title,
                      body: optional(draft.body),
                      url: optional(draft.url),
                      sourceTitle: optional(draft.sourceTitle),
                    }),
                  () => {
                    setFormKey((key) => key + 1);
                    router.refresh();
                  },
                )
              }
            />
          </div>
        </details>
      ) : null}
      <ErrorNotice error={error} />
    </div>
  );
}
