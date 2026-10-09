'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { INTELLIGENCE_MAX_TITLE_CHARS } from '@aila/validation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

/** Title with rename and delete (AILA-V1-SCOPE §7). Delete asks first. */
export function ConversationHeader({ conversationId, title }: { conversationId: string; title: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api.intelligence.rename.mutate({ conversationId, title: draft });
        setMode('view');
        router.refresh();
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await api.intelligence.delete.mutate({ conversationId });
        router.replace('/intelligence');
        router.refresh();
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    });
  }

  return (
    <div className="grid gap-2">
      {mode === 'rename' ? (
        <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
          <label htmlFor="conversation-title" className="sr-only">
            Conversation title
          </label>
          <input
            id="conversation-title"
            value={draft}
            maxLength={INTELLIGENCE_MAX_TITLE_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            className="flex-1 font-serif text-lg md:text-lg"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft(title);
              setMode('view');
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-2xl font-medium" title={title}>
            {title}
          </h2>
          <div className="flex flex-wrap gap-2">
            {mode === 'delete' ? (
              <>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode('view')}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={remove}
                  className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                >
                  {pending ? 'Deleting…' : 'Delete conversation'}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setMode('rename')}>
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMode('delete')}
                  className="font-serif text-base font-semibold tracking-[0.16em] text-destructive uppercase"
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {mode === 'delete' ? (
        <p className="text-sm text-muted-foreground">This permanently removes the conversation and its messages.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
