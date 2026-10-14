'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { TrialSummary } from '@aila/auth/server';
import {
  WRITER_MAX_CONTENT_CHARS,
  WRITER_MAX_SUMMARY_CHARS,
  WRITER_MAX_TITLE_CHARS,
  WRITER_NODE_KIND_LABELS,
  WRITER_NODE_STATUSES,
  WRITER_NODE_STATUS_LABELS,
  countCharacters,
  countWords,
  type WriterNodeKind,
  type WriterNodeStatus,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { cn } from '../../lib/utils';
import { AssistantMarkdown } from '../intelligence/markdown';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { AssistantPanel, type ApplyMode, type Selection } from './assistant-panel';
import { ArchivedNotice, ErrorNotice, ReadOnlyNotice, fieldClass, formatNumber, useAction } from './common';
import { insertLink, insertText, joinBlock, prefixLines, wrapSelection } from './markdown-tools';
import { SAVE_STATUS_LABELS, draftKey, readLocalDraft, useAutosave, type LocalDraft } from './use-autosave';
import { VersionsPanel, type VersionEntry } from './versions-panel';

export type WriterEditorData = {
  readonly node: {
    readonly id: string;
    readonly projectId: string;
    readonly parentId: string | null;
    readonly kind: WriterNodeKind;
    readonly title: string;
    readonly summary: string | null;
    readonly status: WriterNodeStatus;
    readonly content: string;
    readonly wordCount: number;
    readonly charCount: number;
    readonly revision: number;
    readonly updatedAt: string;
    readonly editable: boolean;
  };
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
    readonly outline: readonly {
      readonly id: string;
      readonly parentId: string | null;
      readonly kind: WriterNodeKind;
      readonly title: string;
      readonly depth: number;
      readonly wordCount: number;
    }[];
  };
  readonly versions: readonly (VersionEntry & { readonly createdAt: string })[];
  readonly references: readonly { readonly fileId: string; readonly name: string; readonly type: string }[];
  /** Server-resolved entitlements; display only. */
  readonly canWrite: boolean;
  readonly advancedModels: boolean;
  readonly trial: TrialSummary;
  readonly granted: boolean;
  readonly settings: { readonly locale: string; readonly timezone: string };
};

/** Formatting toolbar: each control edits the Markdown in place. */
const TOOLS: ReadonlyArray<{ label: string; title: string; apply: (element: HTMLTextAreaElement) => void }> = [
  { label: 'H2', title: 'Heading', apply: (element) => prefixLines(element, '## ') },
  { label: 'H3', title: 'Subheading', apply: (element) => prefixLines(element, '### ') },
  { label: 'B', title: 'Bold (Ctrl+B)', apply: (element) => wrapSelection(element, '**', '**', 'bold text') },
  { label: 'I', title: 'Italic (Ctrl+I)', apply: (element) => wrapSelection(element, '*', '*', 'italic text') },
  { label: '• List', title: 'Bulleted list', apply: (element) => prefixLines(element, '- ') },
  { label: '1. List', title: 'Numbered list', apply: (element) => prefixLines(element, (line) => `${line + 1}. `) },
  { label: '“ Quote', title: 'Quote', apply: (element) => prefixLines(element, '> ') },
  { label: 'Link', title: 'Link (Ctrl+K)', apply: insertLink },
  {
    label: 'Break',
    title: 'Scene break',
    apply: (element) => insertText(element, element.selectionStart, element.selectionEnd, '\n\n* * *\n\n'),
  },
];

const NAV_INDENT = ['pl-2', 'pl-5', 'pl-8', 'pl-11'] as const;

const STATUS_TONE: Readonly<Record<string, string>> = {
  saved: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  unsaved: 'text-muted-foreground',
  recovering: 'text-brass-ink',
  offline: 'text-brass-ink',
  failed: 'text-destructive',
  conflict: 'text-destructive',
};

function NodeDetails({
  node,
  editable,
  onTitle,
}: {
  node: WriterEditorData['node'];
  editable: boolean;
  onTitle: (title: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary ?? '');
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    run(
      () => api.writer.nodes.update.mutate({ nodeId: node.id, title, summary: summary.trim() ? summary : null }),
      () => {
        setSaved(true);
        onTitle(title.trim());
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <fieldset disabled={!editable || pending} className="grid gap-3">
        <div className="grid gap-1">
          <label htmlFor="node-title">Title</label>
          <input
            id="node-title"
            required
            value={title}
            maxLength={WRITER_MAX_TITLE_CHARS}
            onChange={(event) => {
              setSaved(false);
              setTitle(event.target.value);
            }}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="node-summary">Synopsis</label>
          <textarea
            id="node-summary"
            rows={3}
            value={summary}
            maxLength={WRITER_MAX_SUMMARY_CHARS}
            onChange={(event) => {
              setSaved(false);
              setSummary(event.target.value);
            }}
            className={fieldClass}
            aria-describedby="node-summary-help"
          />
          <p id="node-summary-help" className="text-xs text-muted-foreground">
            A short summary. It appears in the outline and helps Aila keep the work consistent.
          </p>
        </div>
      </fieldset>
      <ErrorNotice error={error} />
      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : 'Save details'}
          </Button>
          {saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/**
 * The Writer editor (WRITER §11-19): Markdown text with a formatting
 * toolbar, autosave with an explicit save state, recovery of unsaved text,
 * preview, chapter navigation, version history and the AI assistant.
 */
export function EditorView({
  node,
  project,
  versions: initialVersions,
  references,
  canWrite,
  advancedModels,
  trial,
  granted,
  settings,
}: WriterEditorData) {
  const router = useRouter();
  const archived = project.status === 'ARCHIVED';
  const editable = canWrite && node.editable && !archived;
  const autosave = useAutosave({
    nodeId: node.id,
    initialContent: node.content,
    initialRevision: node.revision,
    enabled: editable,
  });
  const { content, setContent, status } = autosave;
  const [title, setTitle] = useState(node.title);
  const [nodeStatus, setNodeStatus] = useState(node.status);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [panel, setPanel] = useState<'assistant' | 'versions' | 'details'>(editable ? 'assistant' : 'versions');
  const [versions, setVersions] = useState<readonly VersionEntry[]>(initialVersions);
  const [recovery, setRecovery] = useState<LocalDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const cursor = useRef(0);
  const aiChange = useRef(false);
  const statusAction = useAction();

  const format = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(settings.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: settings.timezone,
    });
    return (iso: string) => formatter.format(new Date(iso));
  }, [settings.locale, settings.timezone]);

  const deferred = useDeferredValue(content);
  const words = useMemo(() => countWords(deferred), [deferred]);
  const characters = useMemo(() => countCharacters(deferred), [deferred]);

  // Offer text kept in this tab from before a reload (WRITER §52). Read after
  // mounting: sessionStorage does not exist on the server.
  useEffect(() => {
    if (!editable) return;
    const draft = readLocalDraft(node.id);

    if (draft && draft.content !== node.content) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read once after mount
      setRecovery(draft);
      autosave.setStatus('recovering');
    } else if (draft) {
      window.sessionStorage.removeItem(draftKey(node.id));
    }
    // Only on mount for this part.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const index = project.outline.findIndex((item) => item.id === node.id);
  const previous = index > 0 ? project.outline[index - 1] : undefined;
  const next = index >= 0 ? project.outline[index + 1] : undefined;

  function onChange(value: string) {
    const fromAi = aiChange.current;
    aiChange.current = false;
    setContent(value, fromAi ? { keepAiVersion: true } : {});
  }

  function selection(): Selection | null {
    const element = textarea.current;
    if (!element || view !== 'write') return null;
    const { selectionStart: start, selectionEnd: end } = element;
    return end > start ? { start, end, text: element.value.slice(start, end) } : null;
  }

  function applySuggestion(text: string, mode: ApplyMode, from: Selection | null): string | null {
    if (!editable) return 'This part cannot be edited.';
    const current = autosave.content;
    let start: number;
    let end: number;
    let insert = text;

    if (mode === 'replace') {
      if (!from || current.slice(from.start, from.end) !== from.text) {
        return 'The selected text has changed since you asked. Use Insert at cursor or Add to end instead.';
      }
      start = from.start;
      end = from.end;
    } else if (mode === 'insert') {
      start = end = Math.min(textarea.current && view === 'write' ? textarea.current.selectionEnd : cursor.current, current.length);
      insert = joinBlock(current.slice(0, start), text);
    } else {
      start = end = current.length;
      insert = joinBlock(current, text);
    }

    if (current.length - (end - start) + insert.length > WRITER_MAX_CONTENT_CHARS) {
      return 'This part would become too long. Split it into sections first.';
    }

    if (textarea.current && view === 'write') {
      aiChange.current = true;
      insertText(textarea.current, start, end, insert, [start, start + insert.length]);
      aiChange.current = false;
    } else {
      setContent(current.slice(0, start) + insert + current.slice(end), { keepAiVersion: true });
    }
    return null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();

    if (key === 's') {
      event.preventDefault();
      void autosave.saveNow();
    } else if (key === 'b' && editable) {
      event.preventDefault();
      wrapSelection(event.currentTarget, '**', '**', 'bold text');
    } else if (key === 'i' && editable) {
      event.preventDefault();
      wrapSelection(event.currentTarget, '*', '*', 'italic text');
    } else if (key === 'k' && editable) {
      event.preventDefault();
      insertLink(event.currentTarget);
    }
  }

  const statusLabel =
    status === 'saved' && autosave.savedAt ? `Saved ${format(autosave.savedAt)}` : SAVE_STATUS_LABELS[status];

  return (
    <div className="grid gap-5">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm">
        <Link href="/writer" className="text-primary underline decoration-brass underline-offset-4">
          Aila Writer
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/writer/${project.id}`} className="text-primary underline decoration-brass underline-offset-4">
          {project.title}
        </Link>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="label-caps text-brass-ink">{WRITER_NODE_KIND_LABELS[node.kind]}</p>
          <h1 className="text-3xl font-medium tracking-[0.02em] break-words">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" aria-live="polite" className={cn('text-sm', STATUS_TONE[status])}>
            {statusLabel}
          </p>
          {editable ? (
            <>
              <label htmlFor="node-status" className="sr-only">
                Status
              </label>
              <select
                id="node-status"
                value={nodeStatus}
                disabled={statusAction.pending}
                onChange={(event) => {
                  const value = event.target.value as WriterNodeStatus;
                  const before = nodeStatus;
                  setNodeStatus(value);
                  statusAction.run(async () => {
                    try {
                      await api.writer.nodes.update.mutate({ nodeId: node.id, status: value });
                    } catch (caught) {
                      setNodeStatus(before);
                      throw caught;
                    }
                  });
                }}
                className="h-9 w-auto"
              >
                {WRITER_NODE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {WRITER_NODE_STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={status === 'saving' || status === 'conflict' || status === 'recovering'}
                onClick={() => void autosave.saveNow()}
              >
                Save
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{WRITER_NODE_STATUS_LABELS[node.status]}</p>
          )}
        </div>
      </div>
      <ErrorNotice error={statusAction.error} />

      {archived ? <ArchivedNotice /> : null}
      {!canWrite ? (
        <ReadOnlyNotice trial={trial} granted={granted}>
          This text stays available to read. Editing and AI help need Aila Pro.
        </ReadOnlyNotice>
      ) : null}

      {recovery ? (
        <div role="alert" className="grid gap-3 border border-brass/60 p-4">
          <p>
            Unsaved changes to this part were kept in this browser tab ({format(new Date(recovery.at).toISOString())}).
            They are not saved yet.
            {recovery.baseRevision !== node.revision
              ? ' The saved text has changed since then, so you will be asked which text to keep.'
              : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setRecovery(null);
                setContent(recovery.content);
              }}
            >
              Restore my changes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.sessionStorage.removeItem(draftKey(node.id));
                setRecovery(null);
                autosave.setStatus('saved');
              }}
            >
              Discard them
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'conflict' ? (
        <div role="alert" className="grid gap-3 border border-destructive/60 p-4">
          <p className="text-destructive">
            {autosave.error ?? 'This text was changed somewhere else, for example in another tab.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Keep your text (the other text is kept in Versions), or load the saved text and discard what is in this tab.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void autosave.keepMine()}>
              Keep my text
            </Button>
            <Button size="sm" variant="outline" onClick={() => void autosave.loadSaved()}>
              Load the saved text
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard?.writeText(content).then(
                  () => setNotice('Your text was copied.'),
                  () => setNotice('Copying is not available in this browser.'),
                );
              }}
            >
              Copy my text
            </Button>
          </div>
        </div>
      ) : null}
      {status === 'failed' && autosave.error ? (
        <p role="alert" className="text-sm text-destructive">
          {autosave.error} Your text is kept in this tab.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[14rem_minmax(0,1fr)_24rem]">
        <Card role="region" aria-label="Chapters" className="h-fit gap-3 py-4 max-xl:order-last max-xl:lg:col-span-2">
          <CardContent className="grid gap-3 px-4">
            <p className="label-caps text-muted-foreground">Contents</p>
            <nav aria-label="Project parts">
              <ol className="grid max-h-[60vh] gap-0.5 overflow-y-auto">
                {project.outline.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/writer/${project.id}/${item.id}`}
                      aria-current={item.id === node.id ? 'page' : undefined}
                      className={cn(
                        'block rounded-md py-1.5 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        NAV_INDENT[Math.min(item.depth, NAV_INDENT.length - 1)],
                        item.id === node.id ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-accent/60',
                      )}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              {previous ? (
                <Link href={`/writer/${project.id}/${previous.id}`} className="text-primary underline decoration-brass underline-offset-4">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={`/writer/${project.id}/${next.id}`} className="text-primary underline decoration-brass underline-offset-4">
                  Next →
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid h-fit min-w-0 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Editor view" className="flex gap-1">
              <Button size="sm" variant={view === 'write' ? 'default' : 'outline'} aria-pressed={view === 'write'} onClick={() => setView('write')}>
                {editable ? 'Write' : 'Text'}
              </Button>
              <Button size="sm" variant={view === 'preview' ? 'default' : 'outline'} aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
                Preview
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatNumber(words)} words · {formatNumber(characters)} characters
            </p>
          </div>

          {view === 'write' ? (
            <>
              {editable ? (
                <div role="toolbar" aria-label="Formatting" aria-controls="writer-text" className="flex flex-wrap gap-1 border-y py-1">
                  {TOOLS.map((item) => (
                    <Button
                      key={item.label}
                      type="button"
                      size="sm"
                      variant="ghost"
                      title={item.title}
                      aria-label={item.title}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (textarea.current) item.apply(textarea.current);
                      }}
                      disabled={status === 'conflict' || status === 'recovering'}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              <label htmlFor="writer-text" className="sr-only">
                {title} text
              </label>
              <textarea
                ref={textarea}
                id="writer-text"
                value={content}
                readOnly={!editable || status === 'recovering'}
                maxLength={WRITER_MAX_CONTENT_CHARS}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                onSelect={(event) => {
                  cursor.current = event.currentTarget.selectionEnd;
                }}
                spellCheck
                placeholder={editable ? 'Start writing. Markdown works: ## for headings, **bold**, *italic*, - lists.' : ''}
                className="min-h-[65vh] w-full resize-y rounded-md border border-input bg-card p-5 font-serif text-lg leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-describedby="writer-text-help"
              />
              <p id="writer-text-help" className="text-xs text-muted-foreground">
                Changes save automatically. Ctrl+S saves now; Ctrl+Z undoes. Select text to ask Aila about just that
                passage.
              </p>
            </>
          ) : (
            <div className="min-h-[65vh] rounded-md border bg-card p-5 font-serif text-lg">
              {content.trim() ? <AssistantMarkdown text={content} /> : <p className="text-muted-foreground">Nothing written yet.</p>}
            </div>
          )}
        </div>

        <Card role="region" aria-label="Assistant and history" className="h-fit gap-4 py-4">
          <CardContent className="grid gap-4 px-4">
            <div role="tablist" aria-label="Side panel" className="flex flex-wrap gap-1">
              {(
                [
                  ['assistant', 'Assistant'],
                  ['versions', 'Versions'],
                  ['details', 'Details'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={panel === key}
                  aria-controls={`panel-${key}`}
                  size="sm"
                  variant={panel === key ? 'default' : 'ghost'}
                  onClick={() => setPanel(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${panel}`} aria-labelledby={`tab-${panel}`}>
              {panel === 'assistant' ? (
                editable ? (
                  <AssistantPanel
                    nodeId={node.id}
                    projectId={project.id}
                    references={references}
                    advancedModels={advancedModels}
                    getSelection={selection}
                    getText={() => ({
                      text: autosave.content,
                      cursor: textarea.current && view === 'write' ? textarea.current.selectionEnd : cursor.current,
                    })}
                    prepare={() => autosave.saveNow()}
                    onApply={applySuggestion}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {archived ? 'Restore the project to use the assistant.' : 'AI help needs Aila Pro.'}
                  </p>
                )
              ) : panel === 'versions' ? (
                <VersionsPanel
                  nodeId={node.id}
                  versions={versions}
                  editable={editable}
                  dirty={autosave.dirty}
                  revision={autosave.revision}
                  format={format}
                  onSaveFirst={() => autosave.saveNow()}
                  onRestored={(result) => {
                    autosave.replaceWithServer(result.content, result.revision);
                    setTitle(result.title);
                    router.refresh();
                  }}
                  onVersionsChange={setVersions}
                />
              ) : (
                <NodeDetails node={{ ...node, title }} editable={editable} onTitle={setTitle} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
