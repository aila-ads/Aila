import { getDb } from '@aila/db';
import { AppError } from '@aila/validation';
import { auditLogData } from './audit';
import {
  accountScope,
  evaluateProAccess,
  evaluateTrial,
  type AccountContext,
  type ProAccessDecision,
  type TrialState,
} from './policies';

/**
 * The shared trial service (APPLICATION-ARCHITECTURE §25). Trial state is
 * read from the database and evaluated against the server clock only; no
 * client input is used (SECURITY-ARCHITECTURE §9).
 */

/**
 * Records the end of a trial whose time is up. The conditional update makes
 * this safe under concurrent requests: only one of them changes the row and
 * writes the audit entry (PLATFORM-FOUNDATION §37). Access never depends on
 * this write, because it is decided from the timestamps.
 */
async function recordTrialExpiry(
  ctx: AccountContext,
  trialId: string,
  expiresAt: Date,
  now: Date,
  requestId?: string,
): Promise<void> {
  try {
    await getDb().$transaction(async (tx) => {
      const { count } = await tx.trial.updateMany({
        where: { id: trialId, ...accountScope(ctx), status: 'ACTIVE', expiresAt: { lte: now } },
        data: { status: 'EXPIRED', endedAt: expiresAt },
      });

      if (count === 1) {
        await tx.auditLog.create({
          data: auditLogData({
            action: 'UPDATE',
            result: 'SUCCESS',
            accountId: ctx.account.id,
            userId: ctx.user.id,
            resourceType: 'TRIAL',
            resourceId: trialId,
            requestId,
            metadata: { event: 'TRIAL_EXPIRED' },
          }),
        });
      }
    });
  } catch (error) {
    console.error('[trial] Could not record trial expiry', {
      requestId: requestId ?? null,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

/** The account's trial state at the current server time. */
export async function getTrialState(
  ctx: AccountContext,
  requestId?: string,
): Promise<TrialState> {
  const trial = await getDb().trial.findUnique({
    where: { accountId: ctx.account.id },
    select: { id: true, status: true, startedAt: true, expiresAt: true, endedAt: true },
  });
  const now = new Date();
  const state = evaluateTrial(trial, now);

  if (trial && trial.status === 'ACTIVE' && !state.active) {
    await recordTrialExpiry(ctx, trial.id, trial.expiresAt, now, requestId);
  }

  return state;
}

async function hasActiveSubscription(ctx: AccountContext): Promise<boolean> {
  const now = new Date();
  const subscription = await getDb().subscription.findFirst({
    where: {
      ...accountScope(ctx),
      plan: 'AILA_PRO',
      status: 'ACTIVE',
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { id: true },
  });

  return subscription !== null;
}

async function resolveProAccess(
  ctx: AccountContext,
  requestId?: string,
): Promise<{ readonly trial: TrialState; readonly access: ProAccessDecision }> {
  const trial = await getTrialState(ctx, requestId);
  const access = evaluateProAccess(trial, trial.active ? false : await hasActiveSubscription(ctx));
  return { trial, access };
}

/**
 * Guard for Pro features: allows an active trial or an active Aila Pro
 * subscription, otherwise throws TRIAL_EXPIRED or SUBSCRIPTION_REQUIRED
 * (PLATFORM-FOUNDATION §36, PRODUCT-SPEC §7.4).
 */
export async function requireProAccess(
  ctx: AccountContext,
  requestId?: string,
): Promise<'TRIAL' | 'SUBSCRIPTION'> {
  const { access } = await resolveProAccess(ctx, requestId);

  if (!access.allowed) {
    throw new AppError(access.reason);
  }

  return access.source;
}

export type TrialSummary = {
  readonly status: TrialState['status'];
  readonly active: boolean;
  readonly expiresAt: string | null;
  readonly remainingMs: number;
  readonly proAccess: boolean;
};

/** Server-provided trial state for display only (PRODUCT-SPEC §5). */
export async function getTrialSummary(
  ctx: AccountContext,
  requestId?: string,
): Promise<TrialSummary> {
  const { trial, access } = await resolveProAccess(ctx, requestId);

  return {
    status: trial.status,
    active: trial.active,
    expiresAt: trial.expiresAt?.toISOString() ?? null,
    remainingMs: trial.remainingMs,
    proAccess: access.allowed,
  };
}
