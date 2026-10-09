'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

/** Download and delete for one file. Delete asks for confirmation first. */
export function FileActions({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function download() {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await api.files.getDownloadUrl.mutate({ fileId });
        window.location.assign(url);
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await api.files.delete.mutate({ fileId });
        setConfirming(false);
        router.refresh();
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    });
  }

  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={remove}
              className="bg-destructive text-primary-foreground hover:bg-destructive/90"
              aria-label={`Confirm deleting ${name}`}
            >
              {pending ? 'Deleting…' : 'Delete file'}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={download} aria-label={`Download ${name}`}>
              Download
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className="font-serif text-base font-semibold tracking-[0.16em] text-destructive uppercase"
              aria-label={`Delete ${name}`}
            >
              Delete
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
