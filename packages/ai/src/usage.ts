import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb, type ProductCode, type UsageStatus } from '@aila/db';
import type { AiCapability } from '@aila/validation';
import type { AiUsage } from './errors';
import type { UsageSoFar } from './policies';

/**
 * AI usage accounting in Postgres, the authoritative store for limits
 * (AI-GATEWAY §14-15, §28-30, DATABASE-SCHEMA §18-19). One AI_REQUEST row
 * per provider call; prompts and responses are never stored here.
 */

/** Usage that counts against the account's limits since `since`. */
export async function getUsageSince(ctx: AccountContext, since: Date): Promise<UsageSoFar> {
  const db = getDb();
  const where = { ...accountScope(ctx), usageType: 'AI_REQUEST' as const, createdAt: { gte: since } };

  const [requests, tokens] = await Promise.all([
    // Failed requests are not counted; cancelled ones used provider capacity.
    db.usageRecord.count({ where: { ...where, status: { in: ['SUCCESS', 'CANCELLED'] } } }),
    db.usageRecord.aggregate({ where, _sum: { totalTokens: true } }),
  ]);

  return { requests, tokens: tokens._sum.totalTokens ?? 0 };
}

/**
 * Web searches since `since`: AI requests recorded with the `webSearch`
 * flag. Failed requests are not counted, as for the request limit.
 */
export async function getWebSearchesSince(ctx: AccountContext, since: Date): Promise<number> {
  return getDb().usageRecord.count({
    where: {
      ...accountScope(ctx),
      usageType: 'AI_REQUEST',
      createdAt: { gte: since },
      status: { in: ['SUCCESS', 'CANCELLED'] },
      metadata: { path: ['webSearch'], equals: true },
    },
  });
}

/** Whether a successful request with this idempotency key was already recorded. */
export async function isDuplicateRequest(
  ctx: AccountContext,
  idempotencyKey: string,
): Promise<boolean> {
  const existing = await getDb().usageRecord.findFirst({
    where: { ...accountScope(ctx), usageType: 'AI_REQUEST', idempotencyKey, status: 'SUCCESS' },
    select: { id: true },
  });

  return existing !== null;
}

export type UsageEntry = {
  readonly product: ProductCode;
  readonly capability: AiCapability;
  readonly provider: string;
  readonly model: string;
  readonly requestId: string;
  readonly idempotencyKey: string | null;
  readonly usage: AiUsage | null;
  readonly durationMs: number;
  readonly status: UsageStatus;
  readonly attempts: number;
  readonly errorCode: string | null;
  /** The request included a web search (counted for the web search cap). */
  readonly webSearch?: boolean;
};

/**
 * Records one AI request. Never throws: the provider call has already
 * happened, so a failed write is logged (metadata only) instead of failing
 * the user's request.
 */
export async function recordUsage(ctx: AccountContext, entry: UsageEntry): Promise<void> {
  const usage = entry.usage;

  try {
    await getDb().usageRecord.create({
      data: {
        accountId: ctx.account.id,
        userId: ctx.user.id,
        product: entry.product,
        usageType: 'AI_REQUEST',
        operation: entry.capability,
        quantity: 1,
        unit: 'request',
        model: entry.model,
        provider: entry.provider,
        requestId: entry.requestId,
        idempotencyKey: entry.idempotencyKey,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        estimatedCost: usage?.cost ?? null,
        currency: usage?.cost == null ? null : 'USD',
        durationMs: entry.durationMs,
        status: entry.status,
        metadata: {
          attempts: entry.attempts,
          usageEstimated: usage?.estimated ?? true,
          ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
          // Only a flag: the search query is never stored or logged.
          ...(entry.webSearch ? { webSearch: true } : {}),
        },
      },
    });
  } catch (error) {
    console.error('[ai] Could not record usage', {
      requestId: entry.requestId,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
