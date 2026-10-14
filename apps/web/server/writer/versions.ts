import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb } from '@aila/db';
import { AppError, countCharacters, countWords } from '@aila/validation';
import { addVersion, staleError } from './nodes';
import { RESOURCE, archivedError, editableNode, isUniqueViolation, nodeNotFound, requireWriter, visibleNode, writerAudit } from './shared';

/**
 * Version history and restore (docs/products/WRITER.md §14-15). Versions
 * are never changed or removed by a restore: restoring keeps the current
 * text as a new version first, then writes the old text as a new revision,
 * all in one transaction, and records the event.
 */

const VERSION_LIST_LIMIT = 200;

export type VersionSummary = {
  readonly id: string;
  readonly versionNumber: number;
  readonly source: 'MANUAL' | 'MILESTONE' | 'AI' | 'RESTORE';
  readonly label: string | null;
  readonly title: string;
  readonly wordCount: number;
  readonly createdAt: string;
  readonly createdByYou: boolean;
};

const versionNotFound = () => new AppError('NOT_FOUND', { message: 'We could not find that version.' });

/** A node's versions, newest first, without their content. */
export async function listVersions(ctx: AccountContext, nodeId: string): Promise<VersionSummary[]> {
  const db = getDb();
  const node = await db.writerNode.count({ where: visibleNode(ctx, nodeId) });

  if (node === 0) {
    throw nodeNotFound();
  }

  const versions = await db.writerVersion.findMany({
    where: { nodeId, ...accountScope(ctx) },
    select: {
      id: true,
      versionNumber: true,
      source: true,
      label: true,
      title: true,
      wordCount: true,
      createdAt: true,
      createdById: true,
    },
    orderBy: { versionNumber: 'desc' },
    take: VERSION_LIST_LIMIT,
  });

  return versions.map(({ createdById, createdAt, ...version }) => ({
    ...version,
    createdAt: createdAt.toISOString(),
    createdByYou: createdById === ctx.user.id,
  }));
}

export type VersionDetail = VersionSummary & { readonly nodeId: string; readonly content: string };

/** One version with its content, for review before restoring. */
export async function getVersion(ctx: AccountContext, versionId: string): Promise<VersionDetail> {
  const version = await getDb().writerVersion.findFirst({
    where: { id: versionId, ...accountScope(ctx), node: { deletedAt: null }, project: { deletedAt: null } },
    select: {
      id: true,
      nodeId: true,
      versionNumber: true,
      source: true,
      label: true,
      title: true,
      content: true,
      wordCount: true,
      createdAt: true,
      createdById: true,
    },
  });

  if (!version) {
    throw versionNotFound();
  }

  const { createdById, createdAt, ...rest } = version;
  return { ...rest, createdAt: createdAt.toISOString(), createdByYou: createdById === ctx.user.id };
}

/** Keeps the saved text as a named version (explicit user save, WRITER §14). */
export async function createVersion(
  ctx: AccountContext,
  input: { readonly nodeId: string; readonly label?: string | null },
  requestId: string,
): Promise<{ readonly id: string; readonly versionNumber: number }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  try {
    const version = await db.$transaction(async (tx) => {
      const node = await tx.writerNode.findFirst({
        where: editableNode(ctx, input.nodeId),
        select: { id: true, projectId: true, title: true, content: true, revision: true },
      });
      return node ? addVersion(tx, ctx, node, 'MANUAL', input.label ?? null) : null;
    });

    if (!version) {
      throw await editProblem(ctx, input.nodeId);
    }

    return version;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Another version was kept at the same moment; try again.
      throw new AppError('CONFLICT', { message: 'Another version was just saved. Try again.' });
    }

    throw error;
  }
}

async function editProblem(ctx: AccountContext, nodeId: string): Promise<AppError> {
  const node = await getDb().writerNode.findFirst({
    where: visibleNode(ctx, nodeId),
    select: { project: { select: { status: true } } },
  });
  return node?.project.status === 'ARCHIVED' ? archivedError() : nodeNotFound();
}

export type RestoreResult = {
  readonly revision: number;
  readonly title: string;
  readonly content: string;
  readonly wordCount: number;
  readonly charCount: number;
};

/**
 * Restores a version (WRITER §15): 1. authorization (account, live node,
 * active project), 2. the current text is kept as a RESTORE version, 3. the
 * node gets the old title and text as a new revision, 4. an audit event is
 * written, 5. all in one transaction. `baseRevision` must match, so a
 * restore never replaces text the user has not seen.
 */
export async function restoreVersion(
  ctx: AccountContext,
  input: { readonly versionId: string; readonly baseRevision: number },
  requestId: string,
): Promise<RestoreResult> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const result = await db.$transaction(async (tx) => {
    const version = await tx.writerVersion.findFirst({
      where: { id: input.versionId, ...accountScope(ctx) },
      select: { id: true, nodeId: true, versionNumber: true, title: true, content: true },
    });

    if (!version) {
      return { missing: 'version' as const };
    }

    const node = await tx.writerNode.findFirst({
      where: editableNode(ctx, version.nodeId),
      select: { id: true, projectId: true, title: true, content: true, revision: true },
    });

    if (!node) {
      return { missing: 'node' as const, nodeId: version.nodeId };
    }

    if (node.revision !== input.baseRevision) {
      throw staleError();
    }

    await addVersion(tx, ctx, node, 'RESTORE', `Before restoring version ${version.versionNumber}`);
    const wordCount = countWords(version.content);
    const charCount = countCharacters(version.content);
    const { count } = await tx.writerNode.updateMany({
      where: { id: node.id, ...accountScope(ctx), revision: input.baseRevision, deletedAt: null },
      data: {
        title: version.title,
        content: version.content,
        wordCount,
        charCount,
        revision: { increment: 1 },
      },
    });

    if (count === 0) {
      throw staleError();
    }

    await tx.writerProject.update({ where: { id: node.projectId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'UPDATE',
        resourceType: RESOURCE.version,
        resourceId: version.id,
        requestId,
        metadata: { event: 'version_restored', nodeId: node.id, versionNumber: version.versionNumber },
      }),
    });

    return {
      restored: {
        revision: input.baseRevision + 1,
        title: version.title,
        content: version.content,
        wordCount,
        charCount,
      },
    };
  });

  if ('missing' in result) {
    throw result.missing === 'version' ? versionNotFound() : await editProblem(ctx, result.nodeId!);
  }

  return result.restored;
}
