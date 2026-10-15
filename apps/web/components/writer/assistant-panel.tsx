'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  WRITER_AI_OPERATIONS,
  WRITER_AI_OPERATION_LABELS,
  WRITER_MAX_AI_FILES,
  WRITER_MAX_BEFORE_CHARS,
  WRITER_MAX_INSTRUCTION_CHARS,
  WRITER_MAX_SELECTION_CHARS,
  WRITER_MAX_TONE_CHARS,
  WRITER_TONES,
  WRITER_TRANSFORM_OPERATIONS,
  safeSourceUrl,
  type WebSource,
  type WriterAiOperation,
  type WriterTone,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { AssistantMarkdown } from '../intelligence/markdown';
import { Sources } from '../intelligence/sources';
import { Button } from '../ui/button';
import { fieldClass } from './common';

export type Selection = { readonly start: number; readonly end: number; readonly text: string };

type Capability = 'fast' | 'balanced' | 'reasoning';

type AssistError = { readonly message: string; readonly appCode: string; readonly reason: string | null };

type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; webSearch?: string; sources?: WebSource[] }
  | { type: 'error'; appCode: string; reason: string | null; message: string };

const TONE_LABELS: Readonly<Record<WriterTone, string>> = {
  formal: 'Formal',
  friendly: 'Friendly',
  confident: 'Confident',
  persuasive: 'Persuasive',
  academic: 'Academic',
  conversational: 'Conversational',
  literary: 'Literary',
  simple: 'Simple and clear',
  custom: 'Custom…',
};

const OPERATION_HELP: Readonly<Record<WriterAiOperation, string>> = {
  rewrite: 'Rewrites the selected text with the same meaning.',
  improve: 'Improves clarity and flow of the selected text.',
  expand: 'Develops the selected text with more detail.',
  shorten: 'Makes the selected text more concise.',
  tone: 'Rewrites the selected text in another tone.',
  grammar: 'Corrects grammar, spelling and punctuation in the selected text.',
  edit: 'Suggests edits for the selection, or this whole part, without changing it.',
  continue: 'Continues writing from the cursor.',
  summarize: 'Summarizes the selection, or this whole part.',
  outline: 'Suggests an outline using the project structure.',
  brainstorm: 'Generates ideas for what you describe.',
  structure: 'Reviews the structure of this part and the project.',
  continuity: 'Checks this part against the earlier writing and project notes.',
  research: 'Answers a research question, with web sources when web search is on.',
};

const FALLBACK: AssistError = { message: 'Something went wrong. Please try again.', appCode: 'INTERNAL_ERROR', reason: null };
const OFFLINE: AssistError = {
  message: 'We could not reach Aila. Check your connection and try again.',
  appCode: 'DEPENDENCY_FAILURE',
  reason: null,
};

function needsBilling(error: AssistError): boolean {
  return (
    error.appCode === 'TRIAL_EXPIRED' ||
    error.appCode === 'SUBSCRIPTION_REQUIRED' ||
    (error.appCode === 'ENTITLEMENT_REQUIRED' && error.reason !== 'AI_MODEL_NOT_INCLUDED') ||
    error.reason === 'AI_USAGE_LIMIT_REACHED'
  );
}

async function errorFrom(response: Response): Promise<AssistError> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { message?: unknown; data?: { appCode?: unknown; reason?: unknown } } }).error;
    if (typeof error?.message === 'string' && typeof error.data?.appCode === 'string') {
      return {
        message: error.message,
        appCode: error.data.appCode,
        reason: typeof error.data.reason === 'string' ? error.data.reason : null,
      };
    }
  } catch {
    // Not a JSON error response.
  }
  return FALLBACK;
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf('\n');

    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
      newline = buffer.indexOf('\n');
    }

    if (done) return;
  }
}

/** How an accepted suggestion goes into the text. */
export type ApplyMode = 'replace' | 'insert' | 'append';

type Result = {
  readonly operation: WriterAiOperation;
  readonly selection: Selection | null;
  readonly text: string;
  readonly sources: readonly WebSource[];
  readonly instruction: string;
  readonly done: boolean;
  readonly note: string | null;
};

/**
 * The Writer AI assistant (WRITER §16-19). Aila suggests; nothing changes
 * in the text until the author accepts, and an accepted suggestion is
 * saved with a version of the text before it, so it can be undone.
 */
export function AssistantPanel({
  nodeId,
  projectId,
  references,
  advancedModels,
  getSelection,
  getText,
  prepare,
  onApply,
}: {
  nodeId: string;
  projectId: string;
  references: readonly { readonly fileId: string; readonly name: string; readonly type: string }[];
  /** Server-resolved `advanced_models` entitlement; display only. */
  advancedModels: boolean;
  /** The current selection in the editor, or null when nothing is selected. */
  getSelection: () => Selection | null;
  /** The editor text and the cursor position. */
  getText: () => { readonly text: string; readonly cursor: number };
  /** Saves pending edits so whole-part operations see the latest text. */
  prepare: () => Promise<unknown>;
  onApply: (text: string, mode: ApplyMode, selection: Selection | null) => string | null;
}) {
  const [operation, setOperation] = useState<WriterAiOperation>('improve');
  const [tone, setTone] = useState<WriterTone>('formal');
  const [customTone, setCustomTone] = useState('');
  const [instruction, setInstruction] = useState('');
  const [capability, setCapability] = useState<Capability>('balanced');
  const [webSearch, setWebSearch] = useState(false);
  const [fileIds, setFileIds] = useState<readonly string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<AssistError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const transform = WRITER_TRANSFORM_OPERATIONS.includes(operation);
  const needsInstruction = operation === 'research' || operation === 'brainstorm';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (streaming) return;
    setError(null);
    setNotice(null);

    let selection = getSelection();
    const { text, cursor } = getText();

    if (transform && !selection) {
      if (!text.trim()) {
        setError({ message: 'Write or select some text first.', appCode: 'VALIDATION_ERROR', reason: null });
        return;
      }
      if (text.length > WRITER_MAX_SELECTION_CHARS) {
        setError({
          message: 'Select the passage you want Aila to work on (this part is too long to send whole).',
          appCode: 'VALIDATION_ERROR',
          reason: null,
        });
        return;
      }
      // Nothing selected: work on the whole part.
      selection = { start: 0, end: text.length, text };
    }

    if (selection && selection.text.length > WRITER_MAX_SELECTION_CHARS) {
      setError({
        message: `Select up to ${WRITER_MAX_SELECTION_CHARS.toLocaleString()} characters at a time.`,
        appCode: 'VALIDATION_ERROR',
        reason: null,
      });
      return;
    }

    await prepare();

    const abort = new AbortController();
    controller.current = abort;
    const sentInstruction = instruction.trim();
    let reply = '';
    let finished = false;
    setStreaming(true);
    setResult({ operation, selection, text: '', sources: [], instruction: sentInstruction, done: false, note: null });

    try {
      const response = await fetch('/api/writer/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          operation,
          selection: selection?.text ?? '',
          before: operation === 'continue' ? text.slice(Math.max(0, cursor - WRITER_MAX_BEFORE_CHARS), cursor) : '',
          instruction: sentInstruction,
          ...(operation === 'tone' ? { tone, customTone: tone === 'custom' ? customTone : '' } : {}),
          capability,
          webSearch: operation === 'research' && webSearch ? 'on' : 'off',
          fileIds,
          requestKey: crypto.randomUUID(),
        }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        setError(response.ok ? FALLBACK : await errorFrom(response));
      } else {
        for await (const item of readEvents(response.body)) {
          if (item.type === 'text') {
            reply += item.text;
            setResult((current) => (current ? { ...current, text: reply } : current));
          } else if (item.type === 'done') {
            finished = true;
            const note =
              item.webSearch === 'daily_limit'
                ? 'You’ve used today’s web searches, so Aila answered without searching the web.'
                : item.webSearch === 'rate_limited'
                  ? 'Web search is busy right now, so Aila answered without searching the web.'
                  : null;
            setResult((current) => (current ? { ...current, sources: item.sources ?? [], done: true, note } : current));
          } else {
            setError({ message: item.message, appCode: item.appCode, reason: item.reason });
          }
        }
        if (!finished) {
          setError((current) => current ?? OFFLINE);
        }
      }
    } catch {
      if (!abort.signal.aborted) setError(OFFLINE);
    } finally {
      controller.current = null;
      setStreaming(false);
    }

    if (!reply) {
      setResult(null);
    } else if (!finished) {
      setResult((current) => (current ? { ...current, done: true, note: 'This suggestion was interrupted.' } : current));
    }
  }

  function apply(mode: ApplyMode) {
    if (!result) return;
    const problem = onApply(result.text, mode, result.selection);
    if (problem) {
      setNotice(problem);
      return;
    }
    setNotice('Added to your text. A version from before was kept in Versions.');
    setResult(null);
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setNotice('Copied.');
    } catch {
      setNotice('Copying is not available in this browser. Select the text and copy it.');
    }
  }

  async function saveResearch() {
    if (!result) return;
    setNotice(null);
    try {
      if (result.operation === 'research') {
        await api.writer.research.create.mutate({
          projectId,
          kind: 'NOTE',
          title: result.instruction.slice(0, 200) || 'Research notes',
          body: result.text.slice(0, 20_000),
        });
      }
      for (const source of result.sources.filter((item) => safeSourceUrl(item.url) !== null).slice(0, 20)) {
        await api.writer.research.create.mutate({
          projectId,
          kind: 'SOURCE',
          title: (source.title || source.url).slice(0, 200),
          url: source.url,
          sourceTitle: source.title ? source.title.slice(0, 200) : null,
        });
      }
      setNotice('Saved to this project’s research.');
    } catch {
      setNotice('We could not save this to research. Please try again.');
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-1">
          <label htmlFor="assist-operation">What should Aila do?</label>
          <select
            id="assist-operation"
            value={operation}
            onChange={(event) => {
              const next = event.target.value as WriterAiOperation;
              setOperation(next);
              if (next !== 'research') setWebSearch(false);
            }}
            aria-describedby="assist-operation-help"
          >
            {WRITER_AI_OPERATIONS.map((option) => (
              <option key={option} value={option}>
                {WRITER_AI_OPERATION_LABELS[option]}
              </option>
            ))}
          </select>
          <p id="assist-operation-help" className="text-xs text-muted-foreground">
            {OPERATION_HELP[operation]}
            {transform ? ' With nothing selected, Aila works on this whole part.' : ''}
          </p>
        </div>

        {operation === 'tone' ? (
          <div className="grid gap-2">
            <div className="grid gap-1">
              <label htmlFor="assist-tone">Tone</label>
              <select id="assist-tone" value={tone} onChange={(event) => setTone(event.target.value as WriterTone)}>
                {WRITER_TONES.map((option) => (
                  <option key={option} value={option}>
                    {TONE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            {tone === 'custom' ? (
              <div className="grid gap-1">
                <label htmlFor="assist-custom-tone">Describe the tone</label>
                <input
                  id="assist-custom-tone"
                  required
                  value={customTone}
                  maxLength={WRITER_MAX_TONE_CHARS}
                  onChange={(event) => setCustomTone(event.target.value)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-1">
          <label htmlFor="assist-instruction">
            {operation === 'research'
              ? 'Research question'
              : operation === 'brainstorm'
                ? 'What to brainstorm'
                : 'Extra instructions (optional)'}
          </label>
          <textarea
            id="assist-instruction"
            rows={3}
            required={needsInstruction}
            value={instruction}
            maxLength={WRITER_MAX_INSTRUCTION_CHARS}
            onChange={(event) => setInstruction(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            Mode
            <select
              value={capability}
              onChange={(event) => setCapability(event.target.value as Capability)}
              className="w-auto tracking-normal text-foreground normal-case"
            >
              <option value="balanced">Balanced</option>
              <option value="fast">Fast</option>
              <option value="reasoning" disabled={!advancedModels}>
                Deep reasoning{advancedModels ? '' : ' (not in your plan)'}
              </option>
            </select>
          </label>
          {operation === 'research' ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={webSearch} onChange={(event) => setWebSearch(event.target.checked)} />
              Search the web
            </label>
          ) : null}
        </div>

        {references.length > 0 ? (
          <fieldset className="grid gap-1">
            <legend className="label-caps text-muted-foreground">Reference files (up to {WRITER_MAX_AI_FILES})</legend>
            {references.map((file) => {
              const checked = fileIds.includes(file.fileId);
              return (
                <label key={file.fileId} className="flex items-center gap-2 tracking-normal normal-case">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && fileIds.length >= WRITER_MAX_AI_FILES}
                    onChange={(event) =>
                      setFileIds((current) =>
                        event.target.checked ? [...current, file.fileId] : current.filter((id) => id !== file.fileId),
                      )
                    }
                  />
                  <span className="text-sm text-foreground">
                    {file.name} <span className="text-muted-foreground">({file.type})</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {streaming ? (
            <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={(needsInstruction && !instruction.trim()) || (operation === 'tone' && tone === 'custom' && !customTone.trim())}>
              Ask Aila
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <div role="alert" className="grid gap-2 border border-destructive/60 p-3 text-sm">
          <p className="text-destructive">{error.message}</p>
          {needsBilling(error) ? (
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href="/billing">Get Aila Pro</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <article aria-live="polite" aria-busy={streaming} aria-label="Aila’s suggestion" className="grid gap-3 border border-brass/60 p-3">
          <p className="label-caps text-brass-ink">Suggestion · {WRITER_AI_OPERATION_LABELS[result.operation]}</p>
          {result.text ? <AssistantMarkdown text={result.text} /> : <p className="text-muted-foreground">Thinking…</p>}
          {result.sources.length > 0 ? <Sources sources={[...result.sources]} /> : null}
          {result.note ? <p className="text-sm text-muted-foreground">{result.note}</p> : null}
          {result.done ? (
            <div className="flex flex-wrap gap-1">
              {WRITER_TRANSFORM_OPERATIONS.includes(result.operation) && result.selection ? (
                <Button size="sm" onClick={() => apply('replace')}>
                  Replace
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={WRITER_TRANSFORM_OPERATIONS.includes(result.operation) ? 'outline' : 'default'}
                onClick={() => apply('insert')}
              >
                Insert at cursor
              </Button>
              <Button size="sm" variant="outline" onClick={() => apply('append')}>
                Add to end
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void copy()}>
                Copy
              </Button>
              {result.operation === 'research' || result.sources.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => void saveResearch()}>
                  Save to research
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                Discard
              </Button>
            </div>
          ) : null}
        </article>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Aila uses this project’s details, style instructions, terminology and notes. AI can make mistakes; review
        suggestions before you use them.
      </p>
    </div>
  );
}
