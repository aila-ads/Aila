import type { User as SupabaseUser } from '@supabase/supabase-js';
import { db } from '@aila/db';

const TRIAL_DURATION_MS = 3 * 60 * 60 * 1000;

const PRODUCT_ENTITLEMENTS = [
  'INTELLIGENCE',
  'WRITER',
  'TRANSLATE',
  'ADS',
  'LEGAL',
  'CODING',
] as const;

export async function ensureAilaIdentity(authUser: SupabaseUser) {
  if (!authUser.id) {
    throw new Error('Authenticated Supabase user is missing an ID');
  }

  const email = authUser.email;

  if (!email) {
    throw new Error('Authenticated Supabase user is missing an email address');
  }

  const existing = await db.user.findUnique({
    where: { authUserId: authUser.id },
    include: { account: true, memberships: true },
  });

  if (existing) {
    return existing;
  }

  return db.$transaction(async (tx) => {
    const raced = await tx.user.findUnique({
      where: { authUserId: authUser.id },
      include: { account: true, memberships: true },
    });

    if (raced) {
      return raced;
    }

    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);

    const displayName =
      typeof authUser.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name.trim()
        : null;

    const account = await tx.account.create({
      data: {
        primaryEmail: email,
        name: displayName || null,
      },
    });

    const user = await tx.user.create({
      data: {
        accountId: account.id,
        authUserId: authUser.id,
        email,
        emailVerifiedAt: authUser.email_confirmed_at
          ? new Date(authUser.email_confirmed_at)
          : null,
        name: displayName || null,
      },
    });

    await tx.membership.create({
      data: {
        accountId: account.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    await tx.userSettings.create({
      data: {
        accountId: account.id,
        userId: user.id,
      },
    });

    await tx.trial.create({
      data: {
        accountId: account.id,
        startedAt: now,
        expiresAt: trialExpiresAt,
        status: 'ACTIVE',
      },
    });

    await tx.entitlement.createMany({
      data: PRODUCT_ENTITLEMENTS.map((product) => ({
        accountId: account.id,
        product,
        key: `${product.toLowerCase()}:access`,
        source: 'TRIAL',
        effectiveAt: now,
        expiresAt: trialExpiresAt,
      })),
    });

    await tx.auditLog.create({
      data: {
        accountId: account.id,
        userId: user.id,
        action: 'CREATE',
        severity: 'INFO',
        resourceType: 'ACCOUNT',
        resourceId: account.id,
        metadata: {
          source: 'SUPABASE_AUTH_PROVISIONING',
        },
      },
    });

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { account: true, memberships: true },
    });
  });
}
