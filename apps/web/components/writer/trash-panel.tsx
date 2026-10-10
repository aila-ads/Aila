'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WRITER_NODE_KIND_LABELS, type WriterNodeKind } from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { Button } from '../ui/button';
import { ErrorNotice, plural, useAction } from './common';

export type TrashEntry = {
  readonly id: string;
  readonly kind: WriterNodeKind;
  readonly title: string;
  readonly deleted: string;
  readonly contains: number;
};

function TrashRow({ item, editable }: { item: TrashEntry; editable: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useAction();
  const refresh = () => router.refresh();

  return (
    <li className="grid gap-2 border p-3">
      <p>
        <span className="label-caps text-brass-ink">{WRITER_NODE_KIND_LABELS[item.kind]}</span>{' '}
        <span className="font-medium">{item.title}</span>
        <span className="text-sm text-muted-foreground">
          {' '}
          · Moved to trash {item.deleted}
          {item.contains > 0 ? ` · with ${plural(item.contains, 'part', 'parts')} inside` : ''}
        </span>
      </p>
      {editable ? (
        <div className="flex flex-wrap gap-1">
          {confirming ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                onClick={() => run(() => api.writer.nodes.purge.mutate({ nodeId: item.id }), refresh)}
              >
                {pending ? 'Deleting…' : 'Delete permanently'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => api.writer.nodes.restore.mutate({ nodeId: item.id }), refresh)}
              >
                Restore
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
                Delete permanently
              </Button>
            </>
          )}
        </div>
      ) : null}
      {confirming ? (
        <p className="text-sm text-muted-foreground">This removes the writing and its version history for good.</p>
      ) : null}
      <ErrorNotice error={error} />
    </li>
  );
}

/** Parts moved to trash can be restored or deleted for good (WRITER §51). */
export function TrashPanel({ items, editable }: { items: readonly TrashEntry[]; editable: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">The trash is empty.</p>;
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <TrashRow key={item.id} item={item} editable={editable} />
      ))}
    </ul>
  );
}
