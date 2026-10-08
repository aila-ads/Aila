import type {
  AccountStatus,
  EntitlementStatus,
  MembershipRole,
  TrialStatus,
  UserRole,
} from '@aila/db';
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

/** The free trial lasts exactly three hours (PLATFORM-FOUNDATION §9, DATA-ARCHITECTURE §9). */
export const TRIAL_DURATION_MS = 3 * 60 * 60 * 1000;

export type TrialRecord = {
  readonly status: TrialStatus;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  readonly endedAt: Date | null;
};

export type TrialState = {
  /** NONE when the account has no trial. */
  readonly status: TrialStatus | 'NONE';
  readonly active: boolean;
  readonly startedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly endedAt: Date | null;
  readonly remainingMs: number;
};

/**
 * The trial's effective state at the server time `now`. A trial is active
 * only while its status is ACTIVE and `now < expiresAt`; an ACTIVE row past
 * its expiry is reported as EXPIRED (SECURITY-ARCHITECTURE §9,
 * DATABASE-SCHEMA §10).
 */
export function evaluateTrial(trial: TrialRecord | null, now: Date): TrialState {
  if (!trial) {
    return {
      status: 'NONE',
      active: false,
      startedAt: null,
      expiresAt: null,
      endedAt: null,
      remainingMs: 0,
    };
  }

  const active = trial.status === 'ACTIVE' && now.getTime() < trial.expiresAt.getTime();
  const status = trial.status === 'ACTIVE' && !active ? 'EXPIRED' : trial.status;

  return {
    status,
    active,
    startedAt: trial.startedAt,
    expiresAt: trial.expiresAt,
    endedAt: trial.endedAt ?? (status === 'EXPIRED' ? trial.expiresAt : null),
    remainingMs: active ? trial.expiresAt.getTime() - now.getTime() : 0,
  };
}

export type ProAccessDecision =
  | { readonly allowed: true; readonly source: 'TRIAL' | 'SUBSCRIPTION' }
  | { readonly allowed: false; readonly reason: 'TRIAL_EXPIRED' | 'SUBSCRIPTION_REQUIRED' };

/**
 * Pro features are allowed during an active trial or with an active Aila
 * Pro subscription. An ended trial never grants access again
 * (PLATFORM-FOUNDATION §11, PRODUCT-SPEC §7.4).
 */
export function evaluateProAccess(
  trial: TrialState,
  hasActiveSubscription: boolean,
): ProAccessDecision {
  if (trial.active) {
    return { allowed: true, source: 'TRIAL' };
  }

  if (hasActiveSubscription) {
    return { allowed: true, source: 'SUBSCRIPTION' };
  }

  return {
    allowed: false,
    reason: trial.status === 'NONE' ? 'SUBSCRIPTION_REQUIRED' : 'TRIAL_EXPIRED',
  };
}

/**
 * Entitlement keys (PLATFORM-FOUNDATION §16, DATABASE-SCHEMA §16). The first
 * six are the products.
 */
export const ENTITLEMENT_KEYS = [
  'intelligence',
  'writer',
  'translate',
  'ads',
  'legal',
  'coding',
  'file_upload',
  'projects',
  'advanced_models',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const PRODUCT_ENTITLEMENT_KEYS = ENTITLEMENT_KEYS.slice(0, 6);

/**
 * Stored grants that add entitlements on top of the trial and subscription
 * (DATABASE-SCHEMA §17). Rows with any other source, such as the earlier
 * TRIAL rows, are never used: the Trial table alone decides trial access.
 */
export const ENTITLEMENT_GRANT_SOURCES = ['ADMIN', 'SYSTEM'] as const;

export type EntitlementGrant = {
  readonly key: string;
  readonly status: EntitlementStatus;
  readonly source: string;
  readonly effectiveAt: Date;
  readonly expiresAt: Date | null;
};

function isEntitlementKey(key: string): key is EntitlementKey {
  return (ENTITLEMENT_KEYS as readonly string[]).includes(key);
}

/** Whether a stored grant applies at `now`. */
export function grantApplies(grant: EntitlementGrant, now: Date): boolean {
  return (
    grant.status === 'ACTIVE' &&
    (ENTITLEMENT_GRANT_SOURCES as readonly string[]).includes(grant.source) &&
    isEntitlementKey(grant.key) &&
    grant.effectiveAt.getTime() <= now.getTime() &&
    (grant.expiresAt === null || now.getTime() < grant.expiresAt.getTime())
  );
}

/**
 * The account's effective entitlements (PLATFORM-FOUNDATION §17): an active
 * trial or Aila Pro subscription grants every key (AILA-V1-ARCHITECTURE §16,
 * PRODUCT-SPEC §5); applicable ADMIN or SYSTEM grants add their own keys.
 */
export function resolveEntitlementKeys(
  proAccess: ProAccessDecision,
  grants: readonly EntitlementGrant[],
  now: Date,
): EntitlementKey[] {
  if (proAccess.allowed) {
    return [...ENTITLEMENT_KEYS];
  }

  const granted = new Set(grants.filter((grant) => grantApplies(grant, now)).map((g) => g.key));
  return ENTITLEMENT_KEYS.filter((key) => granted.has(key));
}

/**
 * Why a key is missing: TRIAL_EXPIRED or SUBSCRIPTION_REQUIRED when there is
 * no trial or subscription access, ENTITLEMENT_REQUIRED otherwise. Null when
 * the key is available.
 */
export function entitlementDenial(
  key: EntitlementKey,
  keys: readonly EntitlementKey[],
  proAccess: ProAccessDecision,
): 'TRIAL_EXPIRED' | 'SUBSCRIPTION_REQUIRED' | 'ENTITLEMENT_REQUIRED' | null {
  if (keys.includes(key)) {
    return null;
  }

  return proAccess.allowed ? 'ENTITLEMENT_REQUIRED' : proAccess.reason;
}
