import { randomUUID } from 'node:crypto';
import {
  accountScope,
  auditLogData,
  recordAuditEvent,
  requireEntitlement,
  withinRateLimits,
  type AccountContext,
} from '@aila/auth/server';
import { getDb } from '@aila/db';
import {
  AppError,
  resolveFileType,
  type CreateUploadInput,
} from '@aila/validation';
import { head, presignGet, presignPut, readStart, remove } from './client';

/**
 * The shared file service (PLATFORM-FOUNDATION §23-26, DATA-ARCHITECTURE
 * §21-23, AC-022, AC-130-132, AC-200). Every query is scoped to the
 * signed-in account; storage keys are generated, never taken from the
 * user; Postgres holds the authoritative metadata.
 */

const UPLOAD_URL_SECONDS = 5 * 60;
const DOWNLOAD_URL_SECONDS = 60;
const STALE_UPLOAD_MS = 60 * 60 * 1000;
const CLEANUP_BATCH = 5;
const SNIFF_BYTES = 8192;

const RESOURCE = 'file';

export type FileItem = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
};

export type UploadTicket = {
  readonly fileId: string;
  readonly uploadUrl: string;
  readonly contentType: string;
  readonly contentDisposition: string;
};

/** Storage key from generated identifiers only (SECURITY-ARCHITECTURE §15.3). */
function storageKey(accountId: string, fileId: string): string {
  return `accounts/${accountId}/files/${fileId}`;
}

/** Storage or configuration failures become a generic dependency error. */
async function storageCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    console.error('[storage] Operation failed', {
      operation,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AppError('DEPENDENCY_FAILURE');
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

/** Checks the start of the content against the declared type (SECURITY-ARCHITECTURE §15). */
function contentMatches(mimeType: string, bytes: Uint8Array): boolean {
  switch (mimeType) {
    case 'application/pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // ZIP container
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case 'text/plain':
    case 'text/csv':
      if (bytes.includes(0)) {
        return false;
      }
      try {
        // `stream` tolerates a character cut off at the end of the sample.
        new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** Content-Disposition that always downloads, with a safe file name (RFC 6266). */
function attachmentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const CLEANUP_PENDING = { storageCleanup: 'pending' } as const;

/**
 * Durable cleanup without a scheduler (DATA-ARCHITECTURE "Delete File"):
 * retries up to five of the account's objects whose deletion failed, and
 * removes uploads abandoned for over an hour. State lives in Postgres, so
 * nothing is lost if a step fails. Never fails the caller's action.
 */
async function cleanUpAccountFiles(ctx: AccountContext): Promise<void> {
  try {
    const db = getDb();
    const rows = await db.file.findMany({
      where: {
        ...accountScope(ctx),
        OR: [
          { metadata: { path: ['storageCleanup'], equals: 'pending' } },
          { status: 'UPLOADING', createdAt: { lt: new Date(Date.now() - STALE_UPLOAD_MS) } },
        ],
      },
      select: { id: true, storageKey: true, status: true },
      orderBy: { createdAt: 'asc' },
      take: CLEANUP_BATCH,
    });

    for (const row of rows) {
      try {
        await remove(row.storageKey);
        await db.file.update({
          where: { id: row.id },
          data:
            row.status === 'UPLOADING'
              ? { status: 'DELETED', deletedAt: new Date(), metadata: { storageCleanup: 'done', reason: 'abandoned' } }
              : { metadata: { storageCleanup: 'done' } },
        });
      } catch (error) {
        console.error('[storage] Cleanup will be retried', {
          fileId: row.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } catch (error) {
    console.error('[storage] Cleanup skipped', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Starts an upload: entitlement, rate limit and type/size checks, then a
 * metadata row in UPLOADING and a presigned PUT for exactly that object,
 * type and size (PLATFORM-FOUNDATION §25).
 */
export async function createUpload(
  ctx: AccountContext,
  input: CreateUploadInput,
  requestId: string,
): Promise<UploadTicket> {
  await requireEntitlement(ctx, 'file_upload', requestId);

  if (!(await withinRateLimits([['fileUploadPerAccount', ctx.account.id]]))) {
    throw new AppError('RATE_LIMITED');
  }

  const mimeType = resolveFileType(input.name, input.mimeType);

  if (!mimeType) {
    throw new AppError('VALIDATION_ERROR');
  }

  await cleanUpAccountFiles(ctx);

  const fileId = randomUUID();
  const key = storageKey(ctx.account.id, fileId);
  const contentDisposition = attachmentDisposition(input.name);
  const uploadUrl = await storageCall('presign-put', () =>
    presignPut(key, mimeType, input.sizeBytes, contentDisposition, UPLOAD_URL_SECONDS),
  );

  await getDb().file.create({
    data: {
      id: fileId,
      accountId: ctx.account.id,
      userId: ctx.user.id,
      name: input.name,
      mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      storageKey: key,
      source: 'UPLOAD',
      status: 'UPLOADING',
    },
  });

  return { fileId, uploadUrl, contentType: mimeType, contentDisposition };
}

/**
 * Finishes an upload: the stored object must have the declared size and
 * type and its content must match the type. Otherwise it is removed and
 * the file is marked FAILED.
 */
export async function completeUpload(
  ctx: AccountContext,
  fileId: string,
  requestId: string,
): Promise<FileItem> {
  const db = getDb();
  const file = await db.file.findFirst({
    where: { id: fileId, ...accountScope(ctx), status: 'UPLOADING', deletedAt: null },
  });

  if (!file) {
    throw new AppError('NOT_FOUND');
  }

  const stored = await storageCall('head', () => head(file.storageKey));
  let reason: string | null = null;

  if (!stored) {
    reason = 'missing';
  } else if (stored.size !== Number(file.sizeBytes) || stored.contentType !== file.mimeType) {
    reason = 'size_or_type_mismatch';
  } else {
    const start = await storageCall('read-start', () => readStart(file.storageKey, SNIFF_BYTES));
    reason = contentMatches(file.mimeType, start) ? null : 'content_mismatch';
  }

  const audit = {
    action: 'CREATE',
    accountId: ctx.account.id,
    userId: ctx.user.id,
    resourceType: RESOURCE,
    resourceId: file.id,
    requestId,
  } as const;

  if (reason) {
    await db.file.update({
      where: { id: file.id },
      data: { status: 'FAILED', metadata: CLEANUP_PENDING },
    });
    await recordAuditEvent({ ...audit, result: 'FAILURE', metadata: { reason } });
    await cleanUpAccountFiles(ctx);
    throw new AppError('VALIDATION_ERROR', {
      reason,
      message: 'This file could not be accepted. Check that it is a valid file of its type.',
    });
  }

  const ready = await db.file.update({
    where: { id: file.id },
    data: { status: 'READY' },
  });
  await recordAuditEvent({
    ...audit,
    result: 'SUCCESS',
    metadata: { mimeType: ready.mimeType, sizeBytes: Number(ready.sizeBytes) },
  });
  await cleanUpAccountFiles(ctx);

  return toItem(ready);
}

function toItem(file: {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: bigint;
  createdAt: Date;
}): FileItem {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    createdAt: file.createdAt.toISOString(),
  };
}

/** The account's ready files, newest first. Deleted files are never returned. */
export async function listFiles(ctx: AccountContext): Promise<FileItem[]> {
  const files = await getDb().file.findMany({
    where: { ...accountScope(ctx), status: 'READY', deletedAt: null },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return files.map(toItem);
}

/**
 * A 60-second download link for one of the account's ready files. No
 * entitlement is needed: the account's data stays available after the
 * trial (PRODUCT-SPEC §5).
 */
export async function getDownloadUrl(
  ctx: AccountContext,
  fileId: string,
  requestId: string,
): Promise<{ readonly url: string }> {
  const file = await getDb().file.findFirst({
    where: { id: fileId, ...accountScope(ctx), status: 'READY', deletedAt: null },
    select: { id: true, name: true, mimeType: true, storageKey: true },
  });

  if (!file) {
    throw new AppError('NOT_FOUND');
  }

  const url = await storageCall('presign-get', () =>
    presignGet(file.storageKey, file.mimeType, attachmentDisposition(file.name), DOWNLOAD_URL_SECONDS),
  );

  await recordAuditEvent({
    action: 'FILE_ACCESS',
    result: 'SUCCESS',
    accountId: ctx.account.id,
    userId: ctx.user.id,
    resourceType: RESOURCE,
    resourceId: file.id,
    requestId,
  });

  return { url };
}

/**
 * Deletes a file: access stops at once (DELETED with deletedAt, audited in
 * the same transaction), then the object is removed. A failed removal is
 * retried by the account cleanup (AC-132).
 */
export async function deleteFile(
  ctx: AccountContext,
  fileId: string,
  requestId: string,
): Promise<void> {
  const db = getDb();
  const file = await db.file.findFirst({
    where: { id: fileId, ...accountScope(ctx), deletedAt: null, status: { not: 'DELETED' } },
    select: { id: true, storageKey: true },
  });

  if (!file) {
    throw new AppError('NOT_FOUND');
  }

  await db.$transaction([
    db.file.update({
      where: { id: file.id },
      data: { status: 'DELETED', deletedAt: new Date(), metadata: CLEANUP_PENDING },
    }),
    db.auditLog.create({
      data: auditLogData({
        action: 'DELETE',
        result: 'SUCCESS',
        accountId: ctx.account.id,
        userId: ctx.user.id,
        resourceType: RESOURCE,
        resourceId: file.id,
        requestId,
      }),
    }),
  ]);

  await cleanUpAccountFiles(ctx);
}
