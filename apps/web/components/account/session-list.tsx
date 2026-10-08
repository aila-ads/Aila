'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '../../lib/trpc/client';

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
    return <p>No signed-in devices were found.</p>;
  }

  return (
    <div>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <p>
              <strong>{session.device ?? 'Unknown device'}</strong>
              {session.current ? ' (this device)' : null}
            </p>
            <p>
              Signed in {session.signedIn}. Expires {session.expires}.
            </p>
            {session.current ? null : (
              <button
                type="button"
                onClick={() => revoke(session.id)}
                disabled={pending}
                aria-label={`Sign out ${session.device ?? 'unknown device'}, signed in ${session.signedIn}`}
              >
                {revoking === session.id ? 'Signing out…' : 'Sign out device'}
              </button>
            )}
          </li>
        ))}
      </ul>

      <p role="status" aria-live="polite">
        {notice}
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
