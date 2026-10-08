import type { MembershipRole } from '@aila/db';
import { AppError } from '@aila/validation';
import { recordAuditEvent } from './audit';
import { AuthIdentityError, ensureAilaIdentity } from './identity';
import { AUTH_MESSAGES } from './messages';
import {
  evaluateAccountAccess,
  type AccountContext,
  type IdentityRecord,
} from './policies';
import { getSessionState } from './request';

/**
 * Refuses identities whose user or account is suspended, deleted or not a
 * member of the account, and audits the refusal (SECURITY-ARCHITECTURE
 * §2.3, §25, §27). Returns the membership role when access is allowed.
 */
export async function assertActiveIdentity(
  identity: IdentityRecord,
  requestId?: string,
): Promise<MembershipRole> {
  const decision = evaluateAccountAccess(identity);

  if (decision.allowed) {
    return decision.membershipRole;
  }

  await recordAuditEvent({
    action: 'SECURITY_EVENT',
    result: 'DENIED',
    accountId: identity.accountId,
    userId: identity.id,
    resourceType: 'ACCOUNT',
    resourceId: identity.accountId,
    requestId,
    metadata: { event: 'ACCESS_DENIED', reason: decision.reason },
  });

  throw new AppError('FORBIDDEN', {
    reason: 'ACCOUNT_RESTRICTED',
    message: AUTH_MESSAGES.accountRestricted,
  });
}

/**
 * Resolves the trusted context for an authenticated request:
 * session → Aila user → membership → active account
 * (APPLICATION-ARCHITECTURE §13, §22; PLATFORM-FOUNDATION §7).
 *
 * Nothing in the context comes from client input.
 */
export async function resolveAccountContext(
  options: { readonly requestId?: string } = {},
): Promise<AccountContext> {
  const state = await getSessionState();

  if (!state) {
    throw new AppError('UNAUTHENTICATED');
  }

  let identity;

  try {
    identity = await ensureAilaIdentity(state.user);
  } catch (error) {
    if (error instanceof AuthIdentityError) {
      throw error.code === 'EMAIL_NOT_VERIFIED'
        ? new AppError('FORBIDDEN', { reason: 'EMAIL_NOT_VERIFIED' })
        : new AppError('CONFLICT', {
            reason: error.code,
            message: AUTH_MESSAGES.accountUnavailable,
          });
    }

    throw error;
  }

  const membershipRole = await assertActiveIdentity(identity, options.requestId);

  return Object.freeze({
    user: Object.freeze({
      id: identity.id,
      email: identity.email,
      name: identity.name,
      role: identity.role,
    }),
    account: Object.freeze({ id: identity.accountId }),
    membership: Object.freeze({ role: membershipRole }),
    session: Object.freeze({
      id: state.session.id,
      expiresAt: state.session.expiresAt,
    }),
  });
}
