import { auditLogData, requireEntitlement, type AccountContext } from '@aila/auth/server';
import type { Prisma } from '@aila/db';
import { AppError } from '@aila/validation';

/**
 * Shared rules for Aila Writer (docs/products/WRITER.md §7, §35, §55).
 * Every Writer record carries its account ID and every query is scoped to
 * the signed-in account, so an ID alone never grants access: another
 * account's record looks exactly like a missing one.
 */

export const WRITER_PRODUCT = 'WRITER' as const;

export const RESOURCE = {
  project: 'writer_project',
  node: 'writer_node',
  version: 'writer_version',
  research: 'writer_research',
  reference: 'writer_reference',
  export: 'writer_export',
} as const;

export const projectNotFound = () => new AppError('NOT_FOUND', { message: 'We could not find that project.' });
export const nodeNotFound = () =>
  new AppError('NOT_FOUND', { message: 'We could not find that part of the project.' });

/** Projects that exist for the account: active or archived, never deleted. */
export function visibleProject(ctx: AccountContext, projectId: string) {
  return {
    id: projectId,
    accountId: ctx.account.id,
    status: { in: ['ACTIVE', 'ARCHIVED'] as ('ACTIVE' | 'ARCHIVED')[] },
    deletedAt: null,
  };
}

/** Projects the account can change: active only. Archived projects are read-only until restored. */
export function editableProject(ctx: AccountContext, projectId: string) {
  return { id: projectId, accountId: ctx.account.id, status: 'ACTIVE' as const, deletedAt: null };
}

/** Nodes of the account that are not in the trash, in a visible project. */
export function visibleNode(ctx: AccountContext, nodeId: string) {
  return {
    id: nodeId,
    accountId: ctx.account.id,
    deletedAt: null,
    project: { status: { in: ['ACTIVE', 'ARCHIVED'] as ('ACTIVE' | 'ARCHIVED')[] }, deletedAt: null },
  };
}

/** Nodes the account can change: not in the trash, in an active project. */
export function editableNode(ctx: AccountContext, nodeId: string) {
  return {
    id: nodeId,
    accountId: ctx.account.id,
    deletedAt: null,
    project: { status: 'ACTIVE' as const, deletedAt: null },
  };
}

/**
 * Writing, AI and exports need the `writer` entitlement, resolved by the
 * central service on every call (WRITER §35-36). Reading, archiving and
 * deleting do not: the account's work stays available after the trial.
 */
export async function requireWriter(ctx: AccountContext, requestId: string): Promise<void> {
  await requireEntitlement(ctx, 'writer', requestId);
}

/** Explains why an existing project cannot be changed. */
export const archivedError = () =>
  new AppError('CONFLICT', {
    reason: 'WRITER_PROJECT_ARCHIVED',
    message: 'This project is archived. Restore it to make changes.',
  });

/** Audit row for a Writer event. Never contains titles or content (WRITER §55). */
export function writerAudit(
  ctx: AccountContext,
  event: {
    readonly action: 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'FILE_ACCESS';
    readonly resourceType: (typeof RESOURCE)[keyof typeof RESOURCE];
    readonly resourceId: string;
    readonly requestId: string;
    readonly result?: 'SUCCESS' | 'FAILURE';
    readonly metadata?: Prisma.InputJsonObject;
  },
): Prisma.AuditLogUncheckedCreateInput {
  return auditLogData({
    action: event.action,
    result: event.result ?? 'SUCCESS',
    accountId: ctx.account.id,
    userId: ctx.user.id,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    requestId: event.requestId,
    metadata: event.metadata,
  });
}

/** Logs a failure with identifiers only, never user content (WRITER §38, §54). */
export function logWriterError(operation: string, requestId: string, error: unknown): void {
  console.error('[writer] Operation failed', {
    operation,
    requestId,
    error: error instanceof Error ? error.name : 'UnknownError',
  });
}

/** A Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'P2002';
}
