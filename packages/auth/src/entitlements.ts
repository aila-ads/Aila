import { getDb } from '@aila/db';
import { AppError } from '@aila/validation';
import {
  accountScope,
  ENTITLEMENT_GRANT_SOURCES,
  entitlementDenial,
  resolveEntitlementKeys,
  type AccountContext,
  type EntitlementKey,
  type ProAccessDecision,
} from './policies';
import { resolveProAccess } from './trial';

/**
 * The single entitlement service (PLATFORM-FOUNDATION §16-17,
 * APPLICATION-ARCHITECTURE §24, SECURITY-ARCHITECTURE §8). Product code asks
 * `can` / `requireEntitlement` and never reads trial, subscription or billing
 * state itself. Resolved from Postgres on every call; never cached
 * (PLATFORM-FOUNDATION §38).
 */

export type EntitlementResolution = {
  readonly keys: readonly EntitlementKey[];
  readonly proAccess: ProAccessDecision;
};

export async function resolveEntitlements(
  ctx: AccountContext,
  requestId?: string,
): Promise<EntitlementResolution> {
  const [{ access }, grants] = await Promise.all([
    resolveProAccess(ctx, requestId),
    getDb().entitlement.findMany({
      where: {
        ...accountScope(ctx),
        status: 'ACTIVE',
        source: { in: [...ENTITLEMENT_GRANT_SOURCES] },
      },
      select: { key: true, status: true, source: true, effectiveAt: true, expiresAt: true },
    }),
  ]);

  return { keys: resolveEntitlementKeys(access, grants, new Date()), proAccess: access };
}

/** Whether the account may use `key` now. */
export async function can(
  ctx: AccountContext,
  key: EntitlementKey,
  requestId?: string,
): Promise<boolean> {
  return (await resolveEntitlements(ctx, requestId)).keys.includes(key);
}

/**
 * Guard for server-side product code: throws TRIAL_EXPIRED,
 * SUBSCRIPTION_REQUIRED or ENTITLEMENT_REQUIRED when `key` is not available
 * (PLATFORM-FOUNDATION §36). Returns the resolution it checked, so callers
 * that need more (such as the AI gateway's usage plan) do not resolve twice.
 */
export async function requireEntitlement(
  ctx: AccountContext,
  key: EntitlementKey,
  requestId?: string,
): Promise<EntitlementResolution> {
  const resolution = await resolveEntitlements(ctx, requestId);
  const denial = entitlementDenial(key, resolution.keys, resolution.proAccess);

  if (denial) {
    throw new AppError(denial);
  }

  return resolution;
}

export type EntitlementSummary = {
  readonly keys: readonly EntitlementKey[];
  /** Where access comes from: trial, subscription or stored grants only. */
  readonly source: 'TRIAL' | 'SUBSCRIPTION' | 'GRANT' | null;
};

/** Server-resolved entitlements for display only (DATA-ARCHITECTURE §17). */
export async function getEntitlementSummary(
  ctx: AccountContext,
  requestId?: string,
): Promise<EntitlementSummary> {
  const { keys, proAccess } = await resolveEntitlements(ctx, requestId);

  return {
    keys,
    source: proAccess.allowed ? proAccess.source : keys.length > 0 ? 'GRANT' : null,
  };
}
