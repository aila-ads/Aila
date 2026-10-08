import {
  getDb,
  type AuditAction,
  type AuditResult,
  type AuditSeverity,
  type Prisma,
} from '@aila/db';

/**
 * Security audit log (SECURITY-ARCHITECTURE §25, DATABASE-SCHEMA §34,
 * ACCEPTANCE-CRITERIA AC-270).
 *
 * Records event type, account/user, resource, outcome and request ID.
 * Never records passwords, tokens, codes, email addresses, raw IP
 * addresses or user content (SECURITY-ARCHITECTURE §24,
 * DATA-ARCHITECTURE §36).
 */

export type AuditEvent = {
  readonly action: AuditAction;
  readonly result: AuditResult;
  readonly severity?: AuditSeverity;
  readonly accountId?: string | null;
  readonly userId?: string | null;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly requestId?: string | null;
  readonly metadata?: Prisma.InputJsonObject;
};

/** Row data for an audit event, for writing inside a transaction. */
export function auditLogData(event: AuditEvent): Prisma.AuditLogUncheckedCreateInput {
  return {
    action: event.action,
    result: event.result,
    severity: event.severity ?? (event.result === 'SUCCESS' ? 'INFO' : 'WARNING'),
    accountId: event.accountId ?? null,
    userId: event.userId ?? null,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    requestId: event.requestId ?? null,
    metadata: event.metadata,
  };
}

/**
 * Writes an audit event outside any transaction. A failure is reported but
 * never blocks the user's request.
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await getDb().auditLog.create({ data: auditLogData(event) });
  } catch (error) {
    console.error('[audit] Failed to write audit event', {
      action: event.action,
      requestId: event.requestId ?? null,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

export type AuthMethod = 'password' | 'google' | 'email_otp';

export type AuthAuditEvent =
  | { action: 'LOGIN'; method: AuthMethod; accountId: string; userId: string }
  | { action: 'LOGOUT'; accountId: string | null; userId: string | null }
  | { action: 'SECURITY_EVENT'; event: 'SIGN_IN_FAILED'; method: AuthMethod };

/** Authentication events: sign-in, sign-out and failed sign-in. */
export async function recordAuthEvent(event: AuthAuditEvent): Promise<void> {
  if (event.action === 'SECURITY_EVENT') {
    await recordAuditEvent({
      action: 'SECURITY_EVENT',
      result: 'FAILURE',
      resourceType: 'AUTH',
      metadata: { event: event.event, method: event.method },
    });
    return;
  }

  await recordAuditEvent({
    action: event.action,
    result: 'SUCCESS',
    accountId: event.accountId,
    userId: event.userId,
    resourceType: 'SESSION',
    metadata: event.action === 'LOGIN' ? { method: event.method } : undefined,
  });
}
