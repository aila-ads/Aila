'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorCode, apiErrorMessage } from '../../lib/trpc/client';
import { apiErrorReason, isNetworkError } from './common';

/**
 * Autosave for one part of a project (WRITER §12-13, §52).
 *
 * - Edits are debounced; one save runs at a time, and edits made during a
 *   save are saved right after it.
 * - "Saved" is shown only after the server confirms the save.
 * - Every save carries the revision the text was based on. A save based on
 *   older text is refused by the server and autosave stops until the
 *   author chooses how to resolve it: nothing is overwritten silently.
 * - Offline and temporary server failures are retried; validation failures
 *   are not.
 * - Unsaved text is kept in this tab's sessionStorage (cleared when the tab
 *   closes) so it can be recovered after a reload. It is never shown as
 *   saved, and recovery is the author's explicit choice.
 */

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'offline' | 'failed' | 'conflict' | 'recovering';

export const SAVE_STATUS_LABELS: Readonly<Record<SaveStatus, string>> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline: changes kept in this tab',
  failed: 'Save failed',
  conflict: 'Not saved: changed elsewhere',
  recovering: 'Recovering…',
};

const DEBOUNCE_MS = 1_500;
const RETRY_MS = 15_000;
const RETRIABLE = new Set(['INTERNAL_ERROR', 'DEPENDENCY_FAILURE', 'RATE_LIMITED']);

export type LocalDraft = { readonly content: string; readonly baseRevision: number; readonly at: number };

export const draftKey = (nodeId: string) => `aila-writer:draft:${nodeId}`;

export function readLocalDraft(nodeId: string): LocalDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(nodeId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const draft = value as Partial<LocalDraft>;
    return typeof draft.content === 'string' && typeof draft.baseRevision === 'number' && typeof draft.at === 'number'
      ? { content: draft.content, baseRevision: draft.baseRevision, at: draft.at }
      : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(nodeId: string, draft: LocalDraft | null) {
  try {
    if (draft) {
      window.sessionStorage.setItem(draftKey(nodeId), JSON.stringify(draft));
    } else {
      window.sessionStorage.removeItem(draftKey(nodeId));
    }
  } catch {
    // Storage full or unavailable: the text is still in the editor.
  }
}

export function useAutosave({
  nodeId,
  initialContent,
  initialRevision,
  enabled,
}: {
  nodeId: string;
  initialContent: string;
  initialRevision: number;
  /** False when the part cannot be edited (read-only access or archived project). */
  enabled: boolean;
}) {
  const [content, setContentState] = useState(initialContent);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [revision, setRevisionState] = useState(initialRevision);
  const [savedContent, setSavedContent] = useState(initialContent);

  const revisionRef = useRef(initialRevision);
  const saved = useRef(initialContent);
  const latest = useRef(initialContent);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const keepAiVersion = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);

  const setRevision = (value: number) => {
    revisionRef.current = value;
    setRevisionState(value);
  };

  const remember = useCallback(
    (text: string) => {
      writeLocalDraft(
        nodeId,
        text === saved.current ? null : { content: text, baseRevision: revisionRef.current, at: Date.now() },
      );
    },
    [nodeId],
  );

  const clearTimers = () => {
    if (timer.current) clearTimeout(timer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    timer.current = null;
    retryTimer.current = null;
  };

  const schedule = useCallback(
    (delay = DEBOUNCE_MS) => {
      if (!enabled || blocked.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void saveRef.current();
      }, delay);
    },
    [enabled],
  );

  const retryLater = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void saveRef.current();
    }, RETRY_MS);
  }, []);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    clearTimers();

    while (inFlight.current) {
      await inFlight.current;
    }

    if (blocked.current) return false;

    const text = latest.current;
    const keep = keepAiVersion.current;

    if (text === saved.current && !keep) {
      setStatus('saved');
      return true;
    }

    const run = (async () => {
      setStatus('saving');
      setError(null);

      try {
        const result = await api.writer.nodes.save.mutate({
          nodeId,
          content: text,
          baseRevision: revisionRef.current,
          ...(keep ? { keepVersion: 'AI' as const } : {}),
        });
        saved.current = text;
        setSavedContent(text);
        keepAiVersion.current = false;
        setRevision(result.revision);
        setSavedAt(result.savedAt);
        remember(latest.current);

        if (latest.current === text) {
          setStatus('saved');
        } else {
          setStatus('unsaved');
          schedule();
        }
        return true;
      } catch (caught) {
        if (apiErrorReason(caught) === 'WRITER_STALE_REVISION') {
          blocked.current = true;
          setStatus('conflict');
          setError(apiErrorMessage(caught));
        } else if (isNetworkError(caught)) {
          setStatus('offline');
          retryLater();
        } else {
          setStatus('failed');
          setError(apiErrorMessage(caught));
          if (RETRIABLE.has(apiErrorCode(caught) ?? '')) retryLater();
        }
        return false;
      }
    })();

    inFlight.current = run;

    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, [enabled, nodeId, remember, retryLater, schedule]);

  useEffect(() => {
    saveRef.current = saveNow;
  }, [saveNow]);

  /** Changes the text (typing, toolbar or an accepted AI suggestion). */
  const setContent = useCallback(
    (text: string, options: { readonly keepAiVersion?: boolean } = {}) => {
      latest.current = text;
      setContentState(text);
      remember(text);

      if (options.keepAiVersion) keepAiVersion.current = true;
      if (blocked.current) return;

      setStatus(text === saved.current && !keepAiVersion.current ? 'saved' : 'unsaved');
      schedule(options.keepAiVersion ? 0 : DEBOUNCE_MS);
    },
    [remember, schedule],
  );

  /** Replaces the text with what the server now holds (after a restore or a conflict). */
  const replaceWithServer = useCallback(
    (text: string, newRevision: number) => {
      clearTimers();
      blocked.current = false;
      saved.current = text;
      setSavedContent(text);
      latest.current = text;
      keepAiVersion.current = false;
      setRevision(newRevision);
      setContentState(text);
      setStatus('saved');
      setError(null);
      writeLocalDraft(nodeId, null);
    },
    [nodeId],
  );

  /** Conflict: keep the newer server text in history, then save this text over it. */
  const keepMine = useCallback(async () => {
    setStatus('saving');

    try {
      const current = await api.writer.nodes.get.query({ nodeId });
      await api.writer.versions.create.mutate({ nodeId, label: 'Changed elsewhere, before it was replaced' });
      setRevision(current.revision);
      saved.current = current.content;
      setSavedContent(current.content);
      blocked.current = false;
      return await saveNow();
    } catch (caught) {
      setStatus('conflict');
      setError(apiErrorMessage(caught));
      return false;
    }
  }, [nodeId, saveNow]);

  /** Conflict: discard this tab's text and load the saved text. */
  const loadSaved = useCallback(async () => {
    try {
      const current = await api.writer.nodes.get.query({ nodeId });
      replaceWithServer(current.content, current.revision);
      return true;
    } catch (caught) {
      setError(apiErrorMessage(caught));
      return false;
    }
  }, [nodeId, replaceWithServer]);

  // Retry when the connection comes back; save when the tab is hidden.
  useEffect(() => {
    if (!enabled) return;

    const online = () => {
      if (latest.current !== saved.current || keepAiVersion.current) void saveRef.current();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') online();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (latest.current !== saved.current) {
        event.preventDefault();
      }
    };

    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('beforeunload', beforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (latest.current !== saved.current && !blocked.current) void saveRef.current();
    };
  }, [enabled]);

  const dirty = content !== savedContent;

  return {
    content,
    setContent,
    status,
    setStatus,
    error,
    savedAt,
    revision,
    dirty,
    saveNow,
    replaceWithServer,
    keepMine,
    loadSaved,
  };
}
