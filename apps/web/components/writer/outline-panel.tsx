'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  WRITER_ALLOWED_PARENTS,
  WRITER_MAX_NODES,
  WRITER_MAX_TITLE_CHARS,
  WRITER_NODE_KINDS,
  WRITER_NODE_KIND_LABELS,
  WRITER_NODE_STATUSES,
  WRITER_NODE_STATUS_LABELS,
  canPlaceNode,
  type WriterNodeKind,
  type WriterNodeStatus,
} from '@aila/validation';
import { api } from '../../lib/trpc/client';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ErrorNotice, plural, useAction } from './common';

export type OutlineItem = {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: WriterNodeKind;
  readonly title: string;
  readonly summary: string | null;
  readonly status: WriterNodeStatus;
  readonly wordCount: number;
  readonly depth: number;
};

/** Indent by depth with fixed classes (no inline styles under the CSP). */
const INDENT = ['pl-0', 'pl-5', 'pl-10', 'pl-14'] as const;

const kindsUnder = (parentKind: WriterNodeKind | null) =>
  WRITER_NODE_KINDS.filter((kind) => canPlaceNode(kind, parentKind));

function AddForm({
  projectId,
  parent,
  onDone,
}: {
  projectId: string;
  parent: OutlineItem | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const kinds = kindsUnder(parent?.kind ?? null);
  const [kind, setKind] = useState<WriterNodeKind>(kinds.includes('CHAPTER') ? 'CHAPTER' : kinds[0]!);
  const [title, setTitle] = useState('');
  const { pending, error, run } = useAction();
  const id = `add-${parent?.id ?? 'root'}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => api.writer.nodes.create.mutate({ projectId, parentId: parent?.id ?? null, kind, title }),
      () => {
        setTitle('');
        onDone();
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-2 border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor={`${id}-kind`}>Add</label>
          <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as WriterNodeKind)}>
            {kinds.map((option) => (
              <option key={option} value={option}>
                {WRITER_NODE_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <label htmlFor={`${id}-title`}>Title</label>
          <input
            id={`${id}-title`}
            required
            autoFocus={parent !== null}
            value={title}
            maxLength={WRITER_MAX_TITLE_CHARS}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={pending || !title.trim()}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
        {parent ? (
          <Button type="button" size="sm" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
      {parent ? (
        <p className="text-sm text-muted-foreground">
          Inside {WRITER_NODE_KIND_LABELS[parent.kind].toLowerCase()} “{parent.title}”
        </p>
      ) : null}
      <ErrorNotice error={error} />
    </form>
  );
}

function OutlineRow({
  projectId,
  item,
  siblings,
  outline,
  editable,
}: {
  projectId: string;
  item: OutlineItem;
  siblings: readonly OutlineItem[];
  outline: readonly OutlineItem[];
  editable: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'rename' | 'add' | 'move'>('view');
  const [title, setTitle] = useState(item.title);
  const [target, setTarget] = useState(item.parentId ?? '');
  const { pending, error, run } = useAction();
  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  const refresh = () => router.refresh();

  // Valid new parents: allowed by the hierarchy and not inside this item.
  const inside = new Set<string>([item.id]);
  for (const node of outline) {
    if (node.parentId && inside.has(node.parentId)) inside.add(node.id);
  }
  const parents = outline.filter((node) => !inside.has(node.id) && canPlaceNode(item.kind, node.kind));
  const rootAllowed = WRITER_ALLOWED_PARENTS[item.kind].includes(null);
  const canAddInside = kindsUnder(item.kind).length > 0;

  function move(parentId: string | null, to: number) {
    run(() => api.writer.nodes.move.mutate({ nodeId: item.id, parentId, index: to }), refresh);
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => api.writer.nodes.update.mutate({ nodeId: item.id, title }),
      () => {
        setMode('view');
        refresh();
      },
    );
  }

  function moveTo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => api.writer.nodes.move.mutate({ nodeId: item.id, parentId: target || null, index: WRITER_MAX_NODES }),
      () => {
        setMode('view');
        refresh();
      },
    );
  }

  return (
    <li className={cn('grid gap-2', INDENT[Math.min(item.depth, INDENT.length - 1)])}>
      <div className="grid gap-2 border p-3">
        {mode === 'rename' ? (
          <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`rename-${item.id}`} className="sr-only">
              Title
            </label>
            <input
              id={`rename-${item.id}`}
              value={title}
              autoFocus
              required
              maxLength={WRITER_MAX_TITLE_CHARS}
              onChange={(event) => setTitle(event.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={pending || !title.trim()}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setTitle(item.title);
                setMode('view');
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/writer/${projectId}/${item.id}`}
              className="flex min-w-0 flex-wrap items-center gap-2 underline-offset-4 hover:underline"
            >
              <span className="label-caps text-brass-ink">{WRITER_NODE_KIND_LABELS[item.kind]}</span>
              <span className="font-medium">{item.title}</span>
            </Link>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {plural(item.wordCount, 'word', 'words')}
              <Badge variant={item.status === 'FINAL' ? 'default' : 'outline'}>
                {WRITER_NODE_STATUS_LABELS[item.status]}
              </Badge>
            </span>
          </div>
        )}
        {item.summary ? <p className="text-sm text-muted-foreground">{item.summary}</p> : null}

        {editable && mode === 'view' ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || index <= 0}
              onClick={() => move(item.parentId, index - 1)}
              aria-label={`Move “${item.title}” up`}
            >
              Up
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || index < 0 || index >= siblings.length - 1}
              onClick={() => move(item.parentId, index + 1)}
              aria-label={`Move “${item.title}” down`}
            >
              Down
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('rename')}>
              Rename
            </Button>
            {canAddInside ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('add')}>
                Add inside
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('move')}>
              Move to…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => api.writer.nodes.duplicate.mutate({ nodeId: item.id }), refresh)}
            >
              Duplicate
            </Button>
            <label className="sr-only" htmlFor={`status-${item.id}`}>
              Status of “{item.title}”
            </label>
            <select
              id={`status-${item.id}`}
              value={item.status}
              disabled={pending}
              onChange={(event) =>
                run(
                  () =>
                    api.writer.nodes.update.mutate({ nodeId: item.id, status: event.target.value as WriterNodeStatus }),
                  refresh,
                )
              }
              className="h-9 w-auto"
            >
              {WRITER_NODE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {WRITER_NODE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => api.writer.nodes.trash.mutate({ nodeId: item.id }), refresh)}
              className="text-destructive"
            >
              Move to trash
            </Button>
          </div>
        ) : null}

        {mode === 'move' ? (
          <form onSubmit={moveTo} className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-1">
              <label htmlFor={`move-${item.id}`}>Move “{item.title}” into</label>
              <select id={`move-${item.id}`} value={target} onChange={(event) => setTarget(event.target.value)}>
                {rootAllowed ? <option value="">Top level of the project</option> : null}
                {parents.map((node) => (
                  <option key={node.id} value={node.id}>
                    {'— '.repeat(node.depth)}
                    {WRITER_NODE_KIND_LABELS[node.kind]}: {node.title}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={pending || (!rootAllowed && !target)}>
              Move
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode('view')}>
              Cancel
            </Button>
          </form>
        ) : null}
        <ErrorNotice error={error} />
      </div>
      {mode === 'add' ? <AddForm projectId={projectId} parent={item} onDone={() => setMode('view')} /> : null}
    </li>
  );
}

/**
 * The project outline (WRITER §8-10): documents, parts, chapters and
 * sections in reading order. Reordering uses Up and Down, which also work
 * from the keyboard and on touch screens.
 */
export function OutlinePanel({
  projectId,
  outline,
  editable,
}: {
  projectId: string;
  outline: readonly OutlineItem[];
  editable: boolean;
}) {
  const siblingsOf = (parentId: string | null) => outline.filter((node) => node.parentId === parentId);

  return (
    <div className="grid gap-4">
      {outline.length === 0 ? (
        <p className="text-muted-foreground">
          {editable ? 'Add the first chapter or section to start writing.' : 'This project has no chapters yet.'}
        </p>
      ) : (
        <ol className="grid gap-2" aria-label="Project outline">
          {outline.map((item) => (
            <OutlineRow
              key={`${item.id}:${item.title}:${item.parentId ?? ''}`}
              projectId={projectId}
              item={item}
              siblings={siblingsOf(item.parentId)}
              outline={outline}
              editable={editable}
            />
          ))}
        </ol>
      )}
      {editable ? <AddForm projectId={projectId} parent={null} onDone={() => undefined} /> : null}
    </div>
  );
}
