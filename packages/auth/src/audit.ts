import { getDb } from '@aila/db';

export type AuthAuditEvent =
  | { action: 'LOGIN'; method: AuthMethod; accountId: string; userId: string }
  | { action: 'LOGOUT'; accountId: string | null; userId: string | null }
  | { action: 'SECURITY_EVENT'; event: 'SIGN_IN_FAILED'; method: AuthMethod };

export type AuthMethod = 'password' | 'google' | 'email_otp';

/**
 * Records authentication events in the security audit log
 * (SECURITY-ARCHITECTURE §25, ACCEPTANCE-CRITERIA AC-270).
 *
 * Never records passwords, tokens, codes, email addresses or raw IP
 * addresses (SECURITY-ARCHITECTURE §24, DATA-ARCHITECTURE §36).
 * Audit failures are reported but never block the user's request.
 */
export async function recordAuthEvent(event: AuthAuditEvent): Promise<void> {
  try {
    if (event.action === 'SECURITY_EVENT') {
      await getDb().auditLog.create({
        data: {
          action: 'SECURITY_EVENT',
          severity: 'WARNING',
          resourceType: 'AUTH',
          metadata: { event: event.event, method: event.method, result: 'FAILURE' },
        },
      });
      return;
    }

    await getDb().auditLog.create({
      data: {
        accountId: event.accountId,
        userId: event.userId,
        action: event.action,
        severity: 'INFO',
        resourceType: 'SESSION',
        metadata:
          event.action === 'LOGIN'
            ? { method: event.method, result: 'SUCCESS' }
            : { result: 'SUCCESS' },
      },
    });
  } catch (error) {
    console.error('[auth] Failed to write audit event', {
      action: event.action,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
