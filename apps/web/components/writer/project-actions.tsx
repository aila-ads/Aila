'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../lib/trpc/client';
import { Button } from '../ui/button';
import { ErrorNotice, useAction } from './common';

/** Archive, restore and delete a project (WRITER §7.2, §51). Delete asks first. */
export function ProjectActions({
  projectId,
  title,
  archived,
}: {
  projectId: string;
  title: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useAction();

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              className="bg-destructive text-primary-foreground hover:bg-destructive/90"
              onClick={() =>
                run(
                  () => api.writer.projects.delete.mutate({ projectId }),
                  () => {
                    router.replace('/writer');
                    router.refresh();
                  },
                )
              }
            >
              {pending ? 'Deleting…' : 'Delete project'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => api.writer.projects.setArchived.mutate({ projectId, archived: !archived }), () => router.refresh())
              }
            >
              {archived ? 'Restore project' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(true)}
              className="font-serif text-base font-semibold tracking-[0.16em] text-destructive uppercase"
            >
              Delete
            </Button>
          </>
        )}
      </div>
      {confirming ? (
        <p className="text-sm text-muted-foreground">
          This permanently removes “{title}”: its writing, versions, research and exports. Your uploaded files stay in
          Files.
        </p>
      ) : null}
      <ErrorNotice error={error} />
    </div>
  );
}
