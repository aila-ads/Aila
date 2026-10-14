import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb, type Prisma } from '@aila/db';
import {
  AppError,
  canPlaceNode,
  countCharacters,
  countWords,
  WRITER_MAX_NODES,
  WRITER_NODE_KIND_LABELS,
  type CreateWriterNodeInput,
  type MoveWriterNodeInput,
  type SaveWriterContentInput,
  type UpdateWriterNodeInput,
  type WriterNodeKind,
  type WriterNodeStatus,
} from '@aila/validation';
import { projectProblem } from './projects';
import {
  RESOURCE,
  archivedError,
  editableNode,
  editableProject,
  nodeNotFound,
  requireWriter,
  visibleNode,
  visibleProject,
  writerAudit,
} from './shared';
import { compareSiblings, insertAt, renumber, subtreeIds } from './structure';

/**
 * The Writer hierarchy and its content (docs/products/WRITER.md §8-13,
 * §50). Structure changes run in one transaction. Content saves carry the
 * revision they were based on: a save from older content is refused with
 * CONFLICT, never applied over newer work (§13).
 */

type Tx = Prisma.TransactionClient;

/**
 * An autosave keeps a MILESTONE version when the last version of the part
 * is older than this (WRITER §14: significant editing milestones).
 */
export const MILESTONE_INTERVAL_MS = 30 * 60 * 1000;

export type WriterNodeDetail = {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly kind: WriterNodeKind;
  readonly title: string;
  readonly summary: string | null;
  readonly status: WriterNodeStatus;
  readonly content: string;
  readonly wordCount: number;
  readonly charCount: number;
  readonly revision: number;
  readonly updatedAt: string;
  readonly editable: boolean;
};

const nodeSelect = {
  id: true,
  projectId: true,
  parentId: true,
  kind: true,
  title: true,
  summary: true,
  status: true,
  content: true,
  wordCount: true,
  charCount: true,
  revision: true,
  updatedAt: true,
  project: { select: { status: true } },
} as const;

/** One part of a project with its content. */
export async function getNode(ctx: AccountContext, nodeId: string): Promise<WriterNodeDetail> {
  const node = await getDb().writerNode.findFirst({ where: visibleNode(ctx, nodeId), select: nodeSelect });

  if (!node) {
    throw nodeNotFound();
  }

  const { project, ...rest } = node;
  return { ...rest, updatedAt: node.updatedAt.toISOString(), editable: project.status === 'ACTIVE' };
}

/** Why a node cannot be changed: its project is archived, or it was not found. */
async function nodeProblem(ctx: AccountContext, nodeId: string): Promise<AppError> {
  const node = await getDb().writerNode.findFirst({
    where: visibleNode(ctx, nodeId),
    select: { project: { select: { status: true } } },
  });
  return node?.project.status === 'ARCHIVED' ? archivedError() : nodeNotFound();
}

const placementError = (kind: WriterNodeKind, parentKind: WriterNodeKind | null) =>
  new AppError('VALIDATION_ERROR', {
    reason: 'WRITER_INVALID_HIERARCHY',
    message:
      parentKind === null
        ? `A ${WRITER_NODE_KIND_LABELS[kind].toLowerCase()} cannot be at the top level of a project.`
        : `A ${WRITER_NODE_KIND_LABELS[kind].toLowerCase()} cannot go inside a ${WRITER_NODE_KIND_LABELS[parentKind].toLowerCase()}.`,
  });

/** The parent's kind, checked to be a live node of the same project and account. */
async function parentKindOf(
  tx: Tx,
  ctx: AccountContext,
  projectId: string,
  parentId: string | null,
): Promise<WriterNodeKind | null> {
  if (parentId === null) {
    return null;
  }

  const parent = await tx.writerNode.findFirst({
    where: { id: parentId, projectId, ...accountScope(ctx), deletedAt: null },
    select: { kind: true },
  });

  if (!parent) {
    throw nodeNotFound();
  }

  return parent.kind;
}

async function liveSiblings(tx: Tx, ctx: AccountContext, projectId: string, parentId: string | null) {
  const siblings = await tx.writerNode.findMany({
    where: { ...accountScope(ctx), projectId, parentId, deletedAt: null },
    select: { id: true, parentId: true, kind: true, title: true, position: true },
  });
  return siblings.sort(compareSiblings);
}

async function assertNodeRoom(tx: Tx, ctx: AccountContext, projectId: string, adding: number): Promise<void> {
  const count = await tx.writerNode.count({ where: { ...accountScope(ctx), projectId } });

  if (count + adding > WRITER_MAX_NODES) {
    throw new AppError('VALIDATION_ERROR', {
      message: `A project can have up to ${WRITER_MAX_NODES.toLocaleString('en-US')} documents, parts, chapters and sections, including the trash.`,
    });
  }
}

/** Adds a document, part, chapter or section at the end of its parent (AC-071, AC-073). */
export async function createNode(
  ctx: AccountContext,
  input: CreateWriterNodeInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const created = await db.$transaction(async (tx) => {
    const project = await tx.writerProject.findFirst({
      where: editableProject(ctx, input.projectId),
      select: { id: true },
    });

    if (!project) {
      return null;
    }

    const parentKind = await parentKindOf(tx, ctx, input.projectId, input.parentId);

    if (!canPlaceNode(input.kind, parentKind)) {
      throw placementError(input.kind, parentKind);
    }

    await assertNodeRoom(tx, ctx, input.projectId, 1);
    const siblings = await liveSiblings(tx, ctx, input.projectId, input.parentId);
    const position = siblings.reduce((max, node) => Math.max(max, node.position + 1), 0);
    const node = await tx.writerNode.create({
      data: {
        accountId: ctx.account.id,
        projectId: input.projectId,
        parentId: input.parentId,
        createdById: ctx.user.id,
        kind: input.kind,
        title: input.title,
        position,
      },
      select: { id: true },
    });
    await tx.writerProject.update({ where: { id: input.projectId }, data: { updatedAt: new Date() } });
    return node;
  });

  if (!created) {
    throw await projectProblem(ctx, input.projectId);
  }

  return created;
}

/** Renames a part, or changes its synopsis or status. */
export async function updateNode(
  ctx: AccountContext,
  input: UpdateWriterNodeInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const { nodeId, ...changes } = input;
  const data = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));

  if (Object.keys(data).length === 0) {
    return { id: nodeId };
  }

  const { count } = await getDb().writerNode.updateMany({ where: editableNode(ctx, nodeId), data });

  if (count === 0) {
    throw await nodeProblem(ctx, nodeId);
  }

  return { id: nodeId };
}

export type SaveResult = {
  readonly revision: number;
  readonly wordCount: number;
  readonly charCount: number;
  readonly savedAt: string;
};

/** Writes the next version number for a node and returns the new version's ID. */
export async function addVersion(
  tx: Tx,
  ctx: AccountContext,
  node: { readonly id: string; readonly projectId: string; readonly title: string; readonly content: string; readonly revision: number },
  source: 'MANUAL' | 'MILESTONE' | 'AI' | 'RESTORE',
  label: string | null,
): Promise<{ readonly id: string; readonly versionNumber: number }> {
  const last = await tx.writerVersion.findFirst({
    where: { nodeId: node.id, ...accountScope(ctx) },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  return tx.writerVersion.create({
    data: {
      accountId: ctx.account.id,
      projectId: node.projectId,
      nodeId: node.id,
      createdById: ctx.user.id,
      versionNumber,
      revision: node.revision,
      source,
      label,
      title: node.title,
      content: node.content,
      wordCount: countWords(node.content),
    },
    select: { id: true, versionNumber: true },
  });
}

export const staleError = () =>
  new AppError('CONFLICT', {
    reason: 'WRITER_STALE_REVISION',
    message: 'This text was changed somewhere else since you opened it. Your changes were not saved over it.',
  });

/**
 * Saves content (autosave or manual save, WRITER §12-13). Applied only when
 * the stored revision still equals `baseRevision`; otherwise CONFLICT and
 * nothing changes. `keepVersion: 'AI'` first keeps the text as it was, so an
 * accepted AI suggestion can always be undone from history (§19). After a
 * long stretch without a version, a MILESTONE version of the saved text is
 * kept (§14).
 */
export async function saveContent(
  ctx: AccountContext,
  input: SaveWriterContentInput,
  requestId: string,
): Promise<SaveResult> {
  await requireWriter(ctx, requestId);
  const db = getDb();
  const wordCount = countWords(input.content);
  const charCount = countCharacters(input.content);

  const result = await db.$transaction(async (tx) => {
    const node = await tx.writerNode.findFirst({
      where: editableNode(ctx, input.nodeId),
      select: { id: true, projectId: true, title: true, content: true, revision: true },
    });

    if (!node) {
      return null;
    }

    if (node.revision !== input.baseRevision) {
      throw staleError();
    }

    if (input.keepVersion === 'AI') {
      await addVersion(tx, ctx, node, 'AI', 'Before an AI suggestion was applied');
    }

    const now = new Date();
    // The revision in the filter makes a concurrent save lose cleanly.
    const { count } = await tx.writerNode.updateMany({
      where: { id: node.id, ...accountScope(ctx), revision: input.baseRevision, deletedAt: null },
      data: { content: input.content, wordCount, charCount, revision: { increment: 1 }, updatedAt: now },
    });

    if (count === 0) {
      throw staleError();
    }

    const revision = input.baseRevision + 1;
    const lastVersion = await tx.writerVersion.findFirst({
      where: { nodeId: node.id, ...accountScope(ctx) },
      orderBy: { versionNumber: 'desc' },
      select: { createdAt: true, content: true },
    });

    if (
      input.content.trim() &&
      (!lastVersion ||
        (now.getTime() - lastVersion.createdAt.getTime() >= MILESTONE_INTERVAL_MS && lastVersion.content !== input.content))
    ) {
      await addVersion(tx, ctx, { ...node, content: input.content, revision }, 'MILESTONE', null);
    }

    await tx.writerProject.update({ where: { id: node.projectId }, data: { updatedAt: now } });
    return { revision, wordCount, charCount, savedAt: now.toISOString() };
  });

  if (!result) {
    throw await nodeProblem(ctx, input.nodeId);
  }

  return result;
}

/**
 * Moves a node to a new parent and position, or reorders it among its
 * siblings (WRITER §8-9). Both the old and the new sibling lists are
 * renumbered in the same transaction, and a node can never be moved inside
 * itself.
 */
export async function moveNode(
  ctx: AccountContext,
  input: MoveWriterNodeInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const moved = await db.$transaction(async (tx) => {
    const node = await tx.writerNode.findFirst({
      where: editableNode(ctx, input.nodeId),
      select: { id: true, projectId: true, parentId: true, kind: true, title: true, position: true },
    });

    if (!node) {
      return false;
    }

    if (input.parentId !== null) {
      const all = await tx.writerNode.findMany({
        where: { ...accountScope(ctx), projectId: node.projectId },
        select: { id: true, parentId: true },
      });

      if (subtreeIds(all, node.id).has(input.parentId)) {
        throw new AppError('VALIDATION_ERROR', {
          reason: 'WRITER_INVALID_HIERARCHY',
          message: 'A part cannot be moved inside itself.',
        });
      }
    }

    const parentKind = await parentKindOf(tx, ctx, node.projectId, input.parentId);

    if (!canPlaceNode(node.kind, parentKind)) {
      throw placementError(node.kind, parentKind);
    }

    const target = (await liveSiblings(tx, ctx, node.projectId, input.parentId)).filter((item) => item.id !== node.id);
    const ordered = insertAt(target, node, input.index);
    const ownIndex = ordered.findIndex((item) => item.id === node.id);

    await tx.writerNode.update({ where: { id: node.id }, data: { parentId: input.parentId, position: ownIndex } });

    for (const update of renumber(ordered)) {
      if (update.id !== node.id) {
        await tx.writerNode.update({ where: { id: update.id }, data: { position: update.position } });
      }
    }

    if (node.parentId !== input.parentId) {
      const old = (await liveSiblings(tx, ctx, node.projectId, node.parentId)).filter((item) => item.id !== node.id);

      for (const update of renumber(old)) {
        await tx.writerNode.update({ where: { id: update.id }, data: { position: update.position } });
      }
    }

    await tx.writerProject.update({ where: { id: node.projectId }, data: { updatedAt: new Date() } });
    return true;
  });

  if (!moved) {
    throw await nodeProblem(ctx, input.nodeId);
  }

  return { id: input.nodeId };
}

/**
 * Duplicates a node with everything inside it, placed right after the
 * original. Versions are not copied: the copy starts its own history.
 */
export async function duplicateNode(
  ctx: AccountContext,
  nodeId: string,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const copy = await db.$transaction(async (tx) => {
    const node = await tx.writerNode.findFirst({
      where: editableNode(ctx, nodeId),
      select: { id: true, projectId: true, parentId: true },
    });

    if (!node) {
      return null;
    }

    const all = await tx.writerNode.findMany({
      where: { ...accountScope(ctx), projectId: node.projectId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        summary: true,
        position: true,
        status: true,
        content: true,
        wordCount: true,
        charCount: true,
      },
    });
    const ids = subtreeIds(all, node.id);
    const subtree = all.filter((item) => ids.has(item.id));
    await assertNodeRoom(tx, ctx, node.projectId, subtree.length);

    // Make room right after the original: renumber the siblings, leaving a gap.
    const siblings = await liveSiblings(tx, ctx, node.projectId, node.parentId);
    const index = siblings.findIndex((item) => item.id === node.id) + 1;
    const original = all.find((item) => item.id === node.id)!;

    for (const [order, sibling] of siblings.entries()) {
      const position = order < index ? order : order + 1;

      if (sibling.position !== position) {
        await tx.writerNode.update({ where: { id: sibling.id }, data: { position } });
      }
    }

    const newIds = new Map<string, string>();
    const createOne = async (item: (typeof subtree)[number], parentId: string | null, position: number) => {
      const created = await tx.writerNode.create({
        data: {
          accountId: ctx.account.id,
          projectId: node.projectId,
          parentId,
          createdById: ctx.user.id,
          kind: item.kind,
          title: item.id === node.id ? `${item.title} (copy)`.slice(0, 200) : item.title,
          summary: item.summary,
          status: item.status,
          content: item.content,
          wordCount: item.wordCount,
          charCount: item.charCount,
          position,
        },
        select: { id: true },
      });
      newIds.set(item.id, created.id);
      return created.id;
    };

    const rootId = await createOne(original, node.parentId, index);
    const queue = [original.id];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = subtree.filter((item) => item.parentId === parentId).sort(compareSiblings);

      for (const [position, child] of children.entries()) {
        await createOne(child, newIds.get(parentId)!, position);
        queue.push(child.id);
      }
    }

    await tx.writerProject.update({ where: { id: node.projectId }, data: { updatedAt: new Date() } });
    return { id: rootId };
  });

  if (!copy) {
    throw await nodeProblem(ctx, nodeId);
  }

  return copy;
}

/**
 * Moves a node and everything inside it to the project's trash. They stop
 * appearing in the outline, search and exports, and can be restored.
 */
export async function trashNode(
  ctx: AccountContext,
  nodeId: string,
  requestId: string,
): Promise<{ readonly id: string }> {
  const db = getDb();

  const trashed = await db.$transaction(async (tx) => {
    const node = await tx.writerNode.findFirst({
      where: editableNode(ctx, nodeId),
      select: { id: true, projectId: true, kind: true },
    });

    if (!node) {
      return false;
    }

    const all = await tx.writerNode.findMany({
      where: { ...accountScope(ctx), projectId: node.projectId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    const ids = [...subtreeIds(all, node.id)];
    const now = new Date();
    await tx.writerNode.updateMany({
      where: { id: { in: ids }, ...accountScope(ctx), deletedAt: null },
      data: { deletedAt: now },
    });
    await tx.writerProject.update({ where: { id: node.projectId }, data: { updatedAt: now } });
    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'DELETE',
        resourceType: RESOURCE.node,
        resourceId: node.id,
        requestId,
        metadata: { kind: node.kind, trash: true, nodes: ids.length },
      }),
    });
    return true;
  });

  if (!trashed) {
    throw await nodeProblem(ctx, nodeId);
  }

  return { id: nodeId };
}

export type TrashItem = {
  readonly id: string;
  readonly kind: WriterNodeKind;
  readonly title: string;
  readonly deletedAt: string;
  /** Parts trashed together with this one. */
  readonly contains: number;
};

/** What can be restored: nodes trashed on their own, not those trashed along with a parent. */
export async function listTrash(ctx: AccountContext, projectId: string): Promise<TrashItem[]> {
  const db = getDb();
  const project = await db.writerProject.count({ where: visibleProject(ctx, projectId) });

  if (project === 0) {
    throw await projectProblem(ctx, projectId);
  }

  const nodes = await db.writerNode.findMany({
    where: { ...accountScope(ctx), projectId },
    select: { id: true, parentId: true, kind: true, title: true, deletedAt: true },
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return nodes
    .filter((node) => {
      if (!node.deletedAt) return false;
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      return !parent?.deletedAt || parent.deletedAt.getTime() !== node.deletedAt.getTime();
    })
    .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime())
    .map((node) => {
      const ids = subtreeIds(nodes, node.id);
      const contains = nodes.filter(
        (item) => item.id !== node.id && ids.has(item.id) && item.deletedAt?.getTime() === node.deletedAt!.getTime(),
      ).length;
      return { id: node.id, kind: node.kind, title: node.title, deletedAt: node.deletedAt!.toISOString(), contains };
    });
}

async function trashedNode(tx: Tx, ctx: AccountContext, nodeId: string) {
  return tx.writerNode.findFirst({
    where: {
      id: nodeId,
      ...accountScope(ctx),
      deletedAt: { not: null },
      project: { status: 'ACTIVE', deletedAt: null },
    },
    select: { id: true, projectId: true, parentId: true, kind: true, deletedAt: true },
  });
}

/**
 * Restores a trashed node with everything trashed along with it, at the end
 * of its parent. Its parent must not be in the trash.
 */
export async function restoreNode(
  ctx: AccountContext,
  nodeId: string,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const restored = await db.$transaction(async (tx) => {
    const node = await trashedNode(tx, ctx, nodeId);

    if (!node) {
      return false;
    }

    if (node.parentId) {
      const parent = await tx.writerNode.findFirst({
        where: { id: node.parentId, ...accountScope(ctx) },
        select: { deletedAt: true },
      });

      if (parent?.deletedAt) {
        throw new AppError('CONFLICT', {
          reason: 'WRITER_PARENT_IN_TRASH',
          message: 'The part this belongs to is in the trash. Restore that first.',
        });
      }
    }

    const all = await tx.writerNode.findMany({
      where: { ...accountScope(ctx), projectId: node.projectId },
      select: { id: true, parentId: true, deletedAt: true },
    });
    const ids = [...subtreeIds(all, node.id)].filter(
      (id) => all.find((item) => item.id === id)?.deletedAt?.getTime() === node.deletedAt!.getTime(),
    );
    const siblings = await liveSiblings(tx, ctx, node.projectId, node.parentId);
    const position = siblings.reduce((max, item) => Math.max(max, item.position + 1), 0);

    await tx.writerNode.updateMany({ where: { id: { in: ids }, ...accountScope(ctx) }, data: { deletedAt: null } });
    await tx.writerNode.update({ where: { id: node.id }, data: { position } });
    await tx.writerProject.update({ where: { id: node.projectId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'UPDATE',
        resourceType: RESOURCE.node,
        resourceId: node.id,
        requestId,
        metadata: { kind: node.kind, restoredFromTrash: true, nodes: ids.length },
      }),
    });
    return true;
  });

  if (!restored) {
    throw nodeNotFound();
  }

  return { id: nodeId };
}

/** Permanently deletes a trashed node, everything inside it and their versions. */
export async function purgeNode(
  ctx: AccountContext,
  nodeId: string,
  requestId: string,
): Promise<{ readonly id: string }> {
  const db = getDb();

  const purged = await db.$transaction(async (tx) => {
    const node = await trashedNode(tx, ctx, nodeId);

    if (!node) {
      return false;
    }

    const all = await tx.writerNode.findMany({
      where: { ...accountScope(ctx), projectId: node.projectId },
      select: { id: true, parentId: true },
    });
    const ids = [...subtreeIds(all, node.id)];
    await tx.writerVersion.deleteMany({ where: { nodeId: { in: ids }, ...accountScope(ctx) } });
    await tx.writerNode.deleteMany({ where: { id: { in: ids }, ...accountScope(ctx) } });
    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'DELETE',
        resourceType: RESOURCE.node,
        resourceId: node.id,
        requestId,
        metadata: { kind: node.kind, permanent: true, nodes: ids.length },
      }),
    });
    return true;
  });

  if (!purged) {
    throw nodeNotFound();
  }

  return { id: nodeId };
}
