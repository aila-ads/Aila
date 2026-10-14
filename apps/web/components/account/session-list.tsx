'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

export type SessionItem = {
  readonly id: string;
  readonly current: boolean;
  readonly device: string | null;
  readonly signedIn: string;
  readonly expires: string;
};

export function SessionList({ sessions }: { sessions: readonly SessionItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke(sessionId: string) {
    setError(null);
    setNotice(null);
    setRevoking(sessionId);

    startTransition(async () => {
      try {
        await api.account.sessions.revoke.mutate({ sessionId });
        setNotice('The device has been signed out.');
        router.refresh();
      } catch (caught) {
        setError(apiErrorMessage(caught));
      } finally {
        setRevoking(null);
      }
    });
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No signed-in devices were found.</p>;
  }

  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-md border">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="grid gap-1">
              <p>
                <strong>{session.device ?? 'Unknown device'}</strong>
                {session.current ? ' (this device)' : null}
              </p>
              <p className="text-sm text-muted-foreground">
                Signed in {session.signedIn}. Expires {session.expires}.
              </p>
            </div>
            {session.current ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => revoke(session.id)}
                disabled={pending}
                aria-label={`Sign out ${session.device ?? 'unknown device'}, signed in ${session.signedIn}`}
              >
                {revoking === session.id ? 'Signing out…' : 'Sign out device'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
        {notice}
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
