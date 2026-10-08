import type { AccountStatus, MembershipRole, UserRole } from '@aila/db';
import { AppError } from '@aila/validation';

/**
 * Server-side authorization policies (APPLICATION-ARCHITECTURE §23,
 * PLATFORM-FOUNDATION §7-8, SECURITY-ARCHITECTURE §2.3, §7).
 *
 * Pure functions with no I/O. Everything is denied unless a rule
 * explicitly allows it. Resource IDs never grant access on their own: every
 * account-owned query is scoped with `accountScope(ctx)`
 * (DATA-ARCHITECTURE §37).
 */

/** The trusted identity of an authenticated request (APPLICATION-ARCHITECTURE §13). */
export type AccountContext = {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string | null;
    readonly role: UserRole;
  };
  readonly account: { readonly id: string };
  readonly membership: { readonly role: MembershipRole };
  /** The current session. Never contains the session token. */
  readonly session: { readonly id: string; readonly expiresAt: Date };
};

/** The Aila user record with its account and memberships. */
export type IdentityRecord = {
  readonly id: string;
  readonly accountId: string;
  readonly status: AccountStatus;
  readonly deletedAt: Date | null;
  readonly account: {
    readonly id: string;
    readonly status: AccountStatus;
    readonly deletedAt: Date | null;
  };
  readonly memberships: ReadonlyArray<{
    readonly accountId: string;
    readonly role: MembershipRole;
  }>;
};

export type AccountAccessDenialReason =
  | 'USER_INACTIVE'
  | 'ACCOUNT_INACTIVE'
  | 'NO_MEMBERSHIP';

export type AccountAccessDecision =
  | { readonly allowed: true; readonly membershipRole: MembershipRole }
  | { readonly allowed: false; readonly reason: AccountAccessDenialReason };

/**
 * An identity may use Aila only when the user and the account are both
 * active and not deleted, and the user is a member of the account
 * (PLATFORM-FOUNDATION §7 steps 1-2, SECURITY-ARCHITECTURE §27).
 */
export function evaluateAccountAccess(identity: IdentityRecord): AccountAccessDecision {
  if (identity.status !== 'ACTIVE' || identity.deletedAt !== null) {
    return { allowed: false, reason: 'USER_INACTIVE' };
  }

  if (
    identity.account.id !== identity.accountId ||
    identity.account.status !== 'ACTIVE' ||
    identity.account.deletedAt !== null
  ) {
    return { allowed: false, reason: 'ACCOUNT_INACTIVE' };
  }

  const membership = identity.memberships.find(
    (candidate) => candidate.accountId === identity.accountId,
  );

  if (!membership) {
    return { allowed: false, reason: 'NO_MEMBERSHIP' };
  }

  return { allowed: true, membershipRole: membership.role };
}

/** The account boundary: only the caller's own account. */
export function canAccessAccount(ctx: AccountContext, accountId: string): boolean {
  return accountId === ctx.account.id;
}

export function isAccountOwner(ctx: AccountContext): boolean {
  return ctx.membership.role === 'OWNER';
}

/** Application roles are set only by the backend (DATA-ARCHITECTURE §7). */
export function hasAppRole(ctx: AccountContext, role: UserRole): boolean {
  return ctx.user.role === role;
}

/** The mandatory `where` fragment for account-owned records. */
export function accountScope(ctx: AccountContext): { readonly accountId: string } {
  return { accountId: ctx.account.id };
}

/**
 * Throws unless `allowed` is exactly true. Use `NOT_FOUND` when the caller
 * must not learn whether another account's resource exists.
 */
export function authorize(
  allowed: boolean,
  denial: 'FORBIDDEN' | 'NOT_FOUND' = 'FORBIDDEN',
): asserts allowed {
  if (allowed !== true) {
    throw new AppError(denial);
  }
}
