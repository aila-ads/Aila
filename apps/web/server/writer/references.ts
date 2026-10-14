import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb } from '@aila/db';
import { DOCUMENT_TYPES } from '@aila/storage';
import { AppError, FILE_TYPE_LABELS, WRITER_MAX_REFERENCES } from '@aila/validation';
import { projectProblem } from './projects';
import { RESOURCE, editableProject, isUniqueViolation, requireWriter, visibleProject, writerAudit } from './shared';

/**
 * Reference files (docs/products/WRITER.md §25-26). A reference links one
 * of the account's own ready documents (PDF, DOCX, TXT, CSV) in Files to a
 * project; uploads, type checks and storage stay in the shared file
 * service. Text is extracted only for an AI request and never stored.
 */

export type ReferenceItem = {
  readonly fileId: string;
  readonly name: string;
  readonly type: string;
  readonly sizeBytes: number;
};

export async function listReferences(ctx: AccountContext, projectId: string): Promise<ReferenceItem[]> {
  const db = getDb();

  if ((await db.writerProject.count({ where: visibleProject(ctx, projectId) })) === 0) {
    throw await projectProblem(ctx, projectId);
  }

  const references = await db.writerReference.findMany({
    where: { ...accountScope(ctx), projectId, file: { ...accountScope(ctx), status: 'READY', deletedAt: null } },
    select: { file: { select: { id: true, name: true, mimeType: true, sizeBytes: true } } },
    orderBy: { createdAt: 'asc' },
    take: WRITER_MAX_REFERENCES,
  });

  return references.map(({ file }) => ({
    fileId: file.id,
    name: file.name,
    type: FILE_TYPE_LABELS[file.mimeType] ?? 'File',
    sizeBytes: Number(file.sizeBytes),
  }));
}

/** Attaches one of the account's documents to a project. */
export async function attachReference(
  ctx: AccountContext,
  input: { readonly projectId: string; readonly fileId: string },
  requestId: string,
): Promise<{ readonly fileId: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  try {
    const attached = await db.$transaction(async (tx) => {
      if ((await tx.writerProject.count({ where: editableProject(ctx, input.projectId) })) === 0) {
        return 'project' as const;
      }

      const file = await tx.file.findFirst({
        where: { id: input.fileId, ...accountScope(ctx), status: 'READY', deletedAt: null, source: { not: 'GENERATED' } },
        select: { id: true, mimeType: true },
      });

      if (!file) {
        throw new AppError('NOT_FOUND', { message: 'We could not find that file.' });
      }

      if (!DOCUMENT_TYPES.includes(file.mimeType)) {
        throw new AppError('VALIDATION_ERROR', {
          reason: 'WRITER_UNSUPPORTED_REFERENCE',
          message: 'Reference files can be PDF, DOCX, TXT or CSV documents.',
        });
      }

      const count = await tx.writerReference.count({ where: { ...accountScope(ctx), projectId: input.projectId } });

      if (count >= WRITER_MAX_REFERENCES) {
        throw new AppError('VALIDATION_ERROR', {
          message: `A project can have up to ${WRITER_MAX_REFERENCES} reference files.`,
        });
      }

      await tx.writerReference.create({
        data: { accountId: ctx.account.id, projectId: input.projectId, fileId: file.id, createdById: ctx.user.id },
      });
      await tx.auditLog.create({
        data: writerAudit(ctx, {
          action: 'CREATE',
          resourceType: RESOURCE.reference,
          resourceId: file.id,
          requestId,
          metadata: { projectId: input.projectId },
        }),
      });
      return 'ok' as const;
    });

    if (attached === 'project') {
      throw await projectProblem(ctx, input.projectId);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Already attached: nothing to do.
      return { fileId: input.fileId };
    }

    throw error;
  }

  return { fileId: input.fileId };
}

/** Removes a file from a project. The file stays in the account's Files. */
export async function detachReference(
  ctx: AccountContext,
  input: { readonly projectId: string; readonly fileId: string },
  requestId: string,
): Promise<{ readonly fileId: string }> {
  const db = getDb();
  const removed = await db.$transaction(async (tx) => {
    const { count } = await tx.writerReference.deleteMany({
      where: { ...accountScope(ctx), projectId: input.projectId, fileId: input.fileId, project: { deletedAt: null } },
    });

    if (count === 0) {
      return false;
    }

    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'DELETE',
        resourceType: RESOURCE.reference,
        resourceId: input.fileId,
        requestId,
        metadata: { projectId: input.projectId },
      }),
    });
    return true;
  });

  if (!removed) {
    throw new AppError('NOT_FOUND', { message: 'That file is not attached to this project.' });
  }

  return { fileId: input.fileId };
}

/** The IDs of `fileIds` that are references of the project, in the given order. */
export async function projectReferenceIds(
  ctx: AccountContext,
  projectId: string,
  fileIds: readonly string[],
): Promise<string[]> {
  if (fileIds.length === 0) {
    return [];
  }

  const rows = await getDb().writerReference.findMany({
    where: { ...accountScope(ctx), projectId, fileId: { in: [...fileIds] } },
    select: { fileId: true },
  });
  const attached = new Set(rows.map((row) => row.fileId));
  return fileIds.filter((id) => attached.has(id));
}
