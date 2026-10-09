'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  INTELLIGENCE_MAX_FILES,
  INTELLIGENCE_MAX_PROMPT_CHARS,
  type IntelligenceCapability,
} from '@aila/validation';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Attachments, type AttachableFile } from './attachments';
import { AssistantMarkdown } from './markdown';
import { VoiceInput } from './voice-input';

export type { AttachableFile } from './attachments';

export type ChatMessage = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly files: readonly { readonly id: string; readonly name: string }[];
  readonly interrupted: boolean;
  readonly pending?: boolean;
};

type ChatError = {
  readonly message: string;
  readonly appCode: string;
  readonly reason: string | null;
};

const CAPABILITY_OPTIONS: ReadonlyArray<{ value: IntelligenceCapability; label: string }> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'fast', label: 'Fast' },
  { value: 'reasoning', label: 'Deep reasoning' },
];

const FALLBACK: ChatError = {
  message: 'Something went wrong. Please try again.',
  appCode: 'INTERNAL_ERROR',
  reason: null,
};

const OFFLINE: ChatError = {
  message: 'We could not reach Aila. Check your connection and try again.',
  appCode: 'DEPENDENCY_FAILURE',
  reason: null,
};

/** Errors that a subscription resolves get a link to billing. */
function needsBilling(error: ChatError): boolean {
  return (
    error.appCode === 'TRIAL_EXPIRED' ||
    error.appCode === 'SUBSCRIPTION_REQUIRED' ||
    (error.appCode === 'ENTITLEMENT_REQUIRED' && error.reason !== 'AI_MODEL_NOT_INCLUDED') ||
    error.reason === 'AI_USAGE_LIMIT_REACHED'
  );
}

async function errorFrom(response: Response): Promise<ChatError> {
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

type StreamEvent =
  | { type: 'start'; conversationId: string; title: string }
  | { type: 'text'; text: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; appCode: string; reason: string | null; message: string };

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

      if (line) {
        yield JSON.parse(line) as StreamEvent;
      }

      newline = buffer.indexOf('\n');
    }

    if (done) {
      return;
    }
  }
}

/**
 * The conversation and message box (PRODUCT-SPEC §10.4). Replies stream in
 * as they are written; Stop cancels the AI request. What is shown here is
 * for display only: the server decides access and limits.
 */
export function ChatPanel({
  conversationId,
  initialMessages,
  canSend,
  advancedModels,
  files,
}: {
  conversationId: string | null;
  initialMessages: readonly ChatMessage[];
  /** Server-resolved `intelligence` entitlement; display only. */
  canSend: boolean;
  /** Server-resolved `advanced_models` entitlement; display only. */
  advancedModels: boolean;
  files: readonly AttachableFile[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<readonly ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [capability, setCapability] = useState<IntelligenceCapability>('balanced');
  const [selectedFiles, setSelectedFiles] = useState<readonly AttachableFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => () => controller.current?.abort(), []);

  /** Puts transcribed speech into the message box to edit before sending. */
  function insertText(text: string) {
    setNotice(null);
    setInput((current) =>
      (current.trim() ? `${current.trimEnd()} ${text}` : text).slice(0, INTELLIGENCE_MAX_PROMPT_CHARS),
    );
    textarea.current?.focus();
  }

  async function send() {
    const text = input.trim();

    if (!text || streaming || uploading || !canSend) {
      return;
    }

    const userId = `pending-user-${crypto.randomUUID()}`;
    const replyId = `pending-reply-${crypto.randomUUID()}`;
    const attached = selectedFiles.slice(0, INTELLIGENCE_MAX_FILES);
    const abort = new AbortController();
    controller.current = abort;
    let reply = '';
    let newConversationId: string | null = null;
    let failure: ChatError | null = null;
    let completed = false;

    setError(null);
    setNotice(null);
    setStreaming(true);
    setInput('');
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text, files: attached.map(({ id, name }) => ({ id, name })), interrupted: false },
      { id: replyId, role: 'assistant', text: '', files: [], interrupted: false, pending: true },
    ]);

    const updateReply = (patch: Partial<ChatMessage>) =>
      setMessages((current) => current.map((message) => (message.id === replyId ? { ...message, ...patch } : message)));

    try {
      const response = await fetch('/api/intelligence/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(conversationId ? { conversationId } : {}),
          content: text,
          capability,
          fileIds: attached.map((file) => file.id),
          requestKey: crypto.randomUUID(),
        }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        failure = response.ok ? FALLBACK : await errorFrom(response);
      } else {
        for await (const event of readEvents(response.body)) {
          if (event.type === 'start') {
            newConversationId = conversationId ? null : event.conversationId;
          } else if (event.type === 'text') {
            reply += event.text;
            updateReply({ text: reply });
          } else if (event.type === 'done') {
            completed = true;
            updateReply({ id: event.messageId, pending: false });
          } else {
            failure = { message: event.message, appCode: event.appCode, reason: event.reason };
          }
        }

        if (!completed && !failure) {
          failure = OFFLINE;
        }
      }
    } catch {
      failure = abort.signal.aborted ? null : OFFLINE;
    } finally {
      controller.current = null;
      setStreaming(false);
    }

    if (!completed) {
      if (reply) {
        // The server kept the partial reply and marked it as interrupted.
        updateReply({ pending: false, interrupted: true });
      } else {
        // Nothing was answered and the server removed the message: put it back in the box.
        setMessages((current) => current.filter((message) => message.id !== userId && message.id !== replyId));
        setInput(text);
      }
    }

    if (failure) {
      setError(failure);
    }

    if (completed || reply) {
      setSelectedFiles([]);
    }

    if (newConversationId && (completed || reply)) {
      router.replace(`/intelligence/${newConversationId}`);
    }

    router.refresh();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const nearLimit = input.length > INTELLIGENCE_MAX_PROMPT_CHARS * 0.9;

  return (
    <div className="grid gap-4">
      <div aria-live="polite" aria-busy={streaming} className="grid gap-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            Ask anything: ideas, plans, research, analysis or a summary. Your conversations are private to your
            account.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              aria-label={message.role === 'user' ? 'You' : 'Aila'}
              className={cn(
                'grid gap-2 border p-4',
                message.role === 'user' ? 'ml-auto w-full max-w-[85%] bg-secondary' : 'border-brass/60 bg-card',
              )}
            >
              <p className="label-caps text-brass-ink">{message.role === 'user' ? 'You' : 'Aila'}</p>
              {message.role === 'user' ? (
                <p className="break-words whitespace-pre-wrap">{message.text}</p>
              ) : message.text ? (
                <AssistantMarkdown text={message.text} />
              ) : (
                <p className="text-muted-foreground">Thinking…</p>
              )}
              {message.files.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Attached: {message.files.map((file) => file.name).join(', ')}
                </p>
              ) : null}
              {message.interrupted ? (
                <p className="text-sm text-muted-foreground">This reply was interrupted.</p>
              ) : null}
            </article>
          ))
        )}
        <div ref={end} />
      </div>

      {error ? (
        <div role="alert" className="grid gap-2 border border-destructive/60 p-4">
          <p className="text-destructive">{error.message}</p>
          {needsBilling(error) ? (
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href="/billing">Get Aila Pro</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {canSend ? (
        <form onSubmit={onSubmit} className="grid gap-3 border-t border-brass/60 pt-4">
          <label htmlFor="intelligence-message" className="sr-only">
            Message
          </label>
          <textarea
            ref={textarea}
            id="intelligence-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={INTELLIGENCE_MAX_PROMPT_CHARS}
            rows={4}
            placeholder="Message Aila Intelligence"
            className="w-full resize-y border border-input bg-background p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {nearLimit ? (
            <p className="text-sm text-muted-foreground">
              {input.length.toLocaleString()} of {INTELLIGENCE_MAX_PROMPT_CHARS.toLocaleString()} characters
            </p>
          ) : null}

          <Attachments
            files={files}
            selected={selectedFiles}
            disabled={streaming}
            onChange={setSelectedFiles}
            onUploadingChange={setUploading}
            onError={setNotice}
          />

          {notice ? (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2">
              Mode
              <select
                value={capability}
                onChange={(event) => setCapability(event.target.value as IntelligenceCapability)}
                className="w-auto tracking-normal text-foreground normal-case"
              >
                {CAPABILITY_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.value === 'reasoning' && !advancedModels}
                  >
                    {option.label}
                    {option.value === 'reasoning' && !advancedModels ? ' (not in your plan)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <VoiceInput disabled={streaming} onText={insertText} onError={setNotice} />
              {streaming ? (
                <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" disabled={!input.trim() || uploading}>
                  {uploading ? 'Uploading…' : 'Send'}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter to send, Shift+Enter for a new line. Attach PDF, Word, text or image files, or speak with the
            microphone. AI can make mistakes; check important information.
          </p>
        </form>
      ) : null}
    </div>
  );
}
