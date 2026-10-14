import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb, type WriterExportFormat } from '@aila/db';
import { deleteGeneratedFiles, getDownloadUrl, storeGeneratedFile } from '@aila/storage';
import { AppError, isAppError, type CreateWriterExportInput } from '@aila/validation';
import {
  RESOURCE,
  isUniqueViolation,
  logWriterError,
  nodeNotFound,
  projectNotFound,
  requireWriter,
  visibleProject,
  writerAudit,
} from '../shared';
import { subtreeIds } from '../structure';
import { buildExportDocument, exportFileName, type ExportDocument } from './document';
import { DOCX_MIME, renderDocx, validateDocx } from './docx';
import { EPUB_MIME, renderEpub, validateEpub } from './epub';
import { PDF_MIME, renderPdf, validatePdf } from './pdf';

/**
 * Export pipeline (docs/products/WRITER.md §31-33): 1. authorize the
 * project, 2. load the selected content, 3. check it can be exported,
 * 4. generate the file, 5. validate it, 6. store it privately in the
 * shared file service, 7. hand the account a short-lived download link on
 * request. Each export is a WriterExport record with a reliable status;
 * the browser's request key makes a repeat return the same export. The
 * source writing is only read, so a failure can never change it.
 */

/** Most text in one export (about 500,000 words). */
export const EXPORT_MAX_CHARS = 3_000_000;
/** Exports per account per rolling 24 hours. */
export const EXPORT_DAILY_LIMIT = 50;
/** An export still PROCESSING after this is shown as failed (the function ended). */
export const EXPORT_STALE_MS = 10 * 60 * 1000;
const LIST_LIMIT = 20;

const FORMATS: Readonly<
  Record<
    WriterExportFormat,
    {
      readonly mime: string;
      readonly extension: string;
      readonly render: (document: ExportDocument, id: string) => Promise<Uint8Array>;
      readonly validate: (bytes: Uint8Array) => Promise<boolean>;
    }
  >
> = {
  PDF: { mime: PDF_MIME, extension: 'pdf', render: (document) => renderPdf(document), validate: validatePdf },
  DOCX: { mime: DOCX_MIME, extension: 'docx', render: (document) => renderDocx(document), validate: validateDocx },
  EPUB: { mime: EPUB_MIME, extension: 'epub', render: (document, id) => renderEpub(document, id), validate: validateEpub },
};

export type ExportItem = {
  readonly id: string;
  readonly format: WriterExportFormat;
  readonly status: 'PROCESSING' | 'READY' | 'FAILED';
  readonly fileName: string;
  readonly sizeBytes: number | null;
  /** The part exported; null for the whole project. */
  readonly nodeId: string | null;
  readonly createdAt: string;
};

type ExportRow = {
  readonly id: string;
  readonly format: WriterExportFormat;
  readonly status: 'PROCESSING' | 'READY' | 'FAILED';
  readonly fileName: string;
  readonly sizeBytes: number | null;
  readonly nodeId: string | null;
  readonly createdAt: Date;
};

const exportSelect = {
  id: true,
  format: true,
  status: true,
  fileName: true,
  sizeBytes: true,
  nodeId: true,
  createdAt: true,
} as const;

/** The status shown: an export left PROCESSING by an ended function is FAILED. */
export function effectiveStatus(row: Pick<ExportRow, 'status' | 'createdAt'>, now: Date): ExportItem['status'] {
  return row.status === 'PROCESSING' && now.getTime() - row.createdAt.getTime() > EXPORT_STALE_MS ? 'FAILED' : row.status;
}

function toItem(row: ExportRow, now = new Date()): ExportItem {
  return { ...row, status: effectiveStatus(row, now), createdAt: row.createdAt.toISOString() };
}

const exportFailed = () =>
  new AppError('INTERNAL_ERROR', {
    reason: 'WRITER_EXPORT_FAILED',
    message: 'We could not create this export. Your writing is unchanged. Please try again.',
  });

/** Creates an export and returns it once it is ready (or the existing one for a repeated request). */
export async function createExport(
  ctx: AccountContext,
  input: CreateWriterExportInput,
  requestId: string,
): Promise<ExportItem> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const existing = await db.writerExport.findFirst({
    where: { ...accountScope(ctx), requestKey: input.requestKey },
    select: exportSelect,
  });

  if (existing) {
    return toItem(existing);
  }

  const project = await db.writerProject.findFirst({
    where: visibleProject(ctx, input.projectId),
    select: { id: true, title: true, subtitle: true, authorName: true, description: true, language: true, documentType: true },
  });

  if (!project) {
    throw projectNotFound();
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.usageRecord.count({
    where: { ...accountScope(ctx), product: 'WRITER', usageType: 'EXPORT', createdAt: { gte: since } },
  });

  if (recent >= EXPORT_DAILY_LIMIT) {
    throw new AppError('RATE_LIMITED', {
      reason: 'WRITER_EXPORT_LIMIT_REACHED',
      message: `You’ve made ${EXPORT_DAILY_LIMIT} exports today. Please try again tomorrow.`,
    });
  }

  const nodes = await db.writerNode.findMany({
    where: { ...accountScope(ctx), projectId: project.id, deletedAt: null },
    select: { id: true, parentId: true, kind: true, title: true, position: true, content: true },
  });

  let selected = nodes;

  if (input.nodeId) {
    if (!nodes.some((node) => node.id === input.nodeId)) {
      throw nodeNotFound();
    }

    const ids = subtreeIds(nodes, input.nodeId);
    selected = nodes.filter((node) => ids.has(node.id));
  }

  if (selected.length === 0) {
    throw new AppError('VALIDATION_ERROR', {
      reason: 'WRITER_EXPORT_EMPTY',
      message: 'Add a chapter or document before exporting.',
    });
  }

  if (selected.reduce((total, node) => total + node.content.length, 0) > EXPORT_MAX_CHARS) {
    throw new AppError('VALIDATION_ERROR', {
      reason: 'WRITER_EXPORT_TOO_LARGE',
      message: 'This is too long to export at once. Export one document or part at a time.',
    });
  }

  const format = FORMATS[input.format];
  const rootTitle = input.nodeId ? selected.find((node) => node.id === input.nodeId)!.title : project.title;
  const fileName = exportFileName(rootTitle, format.extension);
  let row: ExportRow;

  try {
    row = await db.writerExport.create({
      data: {
        accountId: ctx.account.id,
        projectId: project.id,
        nodeId: input.nodeId ?? null,
        createdById: ctx.user.id,
        format: input.format,
        status: 'PROCESSING',
        requestKey: input.requestKey,
        fileName,
      },
      select: exportSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await db.writerExport.findFirst({
        where: { ...accountScope(ctx), requestKey: input.requestKey },
        select: exportSelect,
      });

      if (again) return toItem(again);
    }

    throw error;
  }

  const started = Date.now();
  let storedFileId: string | null = null;

  try {
    const document = buildExportDocument(project, selected, input.nodeId ?? null);
    const bytes = await format.render(document, row.id);

    if (!(await format.validate(bytes))) {
      throw new Error('Export validation failed');
    }

    const fileId = await storeGeneratedFile(ctx, { name: fileName, mimeType: format.mime, bytes }, requestId);
    storedFileId = fileId;
    const completedAt = new Date();
    const [ready] = await db.$transaction([
      db.writerExport.update({
        where: { id: row.id },
        data: { status: 'READY', fileId, sizeBytes: bytes.byteLength, completedAt },
        select: exportSelect,
      }),
      db.usageRecord.create({
        data: {
          accountId: ctx.account.id,
          userId: ctx.user.id,
          product: 'WRITER',
          usageType: 'EXPORT',
          quantity: 1,
          unit: 'export',
          operation: `export_${input.format.toLowerCase()}`,
          requestId,
          idempotencyKey: `writer-export:${input.requestKey}`,
          durationMs: completedAt.getTime() - started,
          status: 'SUCCESS',
          metadata: { sizeBytes: bytes.byteLength, scope: input.nodeId ? 'node' : 'project' },
        },
      }),
      db.auditLog.create({
        data: writerAudit(ctx, {
          action: 'EXPORT',
          resourceType: RESOURCE.export,
          resourceId: row.id,
          requestId,
          metadata: { projectId: project.id, format: input.format, fileId },
        }),
      }),
    ]);

    return toItem(ready);
  } catch (error) {
    logWriterError(`export-${input.format.toLowerCase()}`, requestId, error);

    if (storedFileId) {
      await deleteGeneratedFiles(ctx, [storedFileId], requestId).catch(() => undefined);
    }

    await db.writerExport
      .update({
        where: { id: row.id },
        data: { status: 'FAILED', errorCode: isAppError(error) ? error.code : 'GENERATION_FAILED', completedAt: new Date() },
      })
      .catch(() => undefined);
    await db.auditLog
      .create({
        data: writerAudit(ctx, {
          action: 'EXPORT',
          result: 'FAILURE',
          resourceType: RESOURCE.export,
          resourceId: row.id,
          requestId,
          metadata: { projectId: project.id, format: input.format },
        }),
      })
      .catch(() => undefined);

    throw isAppError(error) && error.code === 'DEPENDENCY_FAILURE' ? error : exportFailed();
  }
}

/** The project's most recent exports. */
export async function listExports(ctx: AccountContext, projectId: string): Promise<ExportItem[]> {
  const db = getDb();

  if ((await db.writerProject.count({ where: visibleProject(ctx, projectId) })) === 0) {
    throw projectNotFound();
  }

  const rows = await db.writerExport.findMany({
    where: { ...accountScope(ctx), projectId },
    select: exportSelect,
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  const now = new Date();
  return rows.map((row) => toItem(row, now));
}

const exportNotFound = () => new AppError('NOT_FOUND', { message: 'We could not find that export.' });

/**
 * A short-lived download link for a ready export. The file service checks
 * the account again and records the access. No entitlement is needed: the
 * account's finished exports stay available.
 */
export async function downloadExport(
  ctx: AccountContext,
  exportId: string,
  requestId: string,
): Promise<{ readonly url: string }> {
  const row = await getDb().writerExport.findFirst({
    where: { id: exportId, ...accountScope(ctx), status: 'READY', fileId: { not: null }, project: { deletedAt: null } },
    select: { fileId: true },
  });

  if (!row?.fileId) {
    throw exportNotFound();
  }

  return getDownloadUrl(ctx, row.fileId, requestId);
}

/** Deletes an export and its file. */
export async function deleteExport(ctx: AccountContext, exportId: string, requestId: string): Promise<{ readonly id: string }> {
  const db = getDb();
  const fileId = await db.$transaction(async (tx) => {
    const row = await tx.writerExport.findFirst({
      where: { id: exportId, ...accountScope(ctx), project: { deletedAt: null } },
      select: { id: true, fileId: true },
    });

    if (!row) {
      return undefined;
    }

    await tx.writerExport.delete({ where: { id: row.id } });
    await tx.auditLog.create({
      data: writerAudit(ctx, { action: 'DELETE', resourceType: RESOURCE.export, resourceId: row.id, requestId }),
    });
    return row.fileId;
  });

  if (fileId === undefined) {
    throw exportNotFound();
  }

  if (fileId) {
    try {
      await deleteGeneratedFiles(ctx, [fileId], requestId);
    } catch (error) {
      logWriterError('delete-export-file', requestId, error);
    }
  }

  return { id: exportId };
}
