import { getDb } from '@aila/db';
import { auditLogData } from './audit';
import { TRIAL_DURATION_MS } from './policies';

const PRODUCT_ENTITLEMENTS = [
  'INTELLIGENCE',
  'WRITER',
  'TRANSLATE',
  'ADS',
  'LEGAL',
  'CODING',
] as const;

/**
 * The authenticated Neon Auth user, as returned in the Neon session.
 * `id` is stored as `User.authUserId` (DATA-ARCHITECTURE §4, DATABASE-SCHEMA §7).
 */
export type NeonAuthUser = {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string | null;
};

export type AuthIdentityErrorCode = 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_LINK_CONFLICT';

export class AuthIdentityError extends Error {
  constructor(readonly code: AuthIdentityErrorCode) {
    super(code);
    this.name = 'AuthIdentityError';
  }
}

const identityInclude = { account: true, memberships: true } as const;

/**
 * Resolves the Aila user for an authenticated Neon Auth user.
 *
 * 1. A user already linked by `authUserId` is returned.
 * 2. Otherwise, if exactly one existing user has the same email (case
 *    insensitive), it is re-linked to the Neon Auth user ID. This keeps
 *    users created under the previous auth provider. It only ever happens
 *    for an email Neon Auth reports as verified.
 * 3. Otherwise a new Aila account is provisioned (unchanged bootstrap:
 *    account, user, OWNER membership, settings, trial, entitlements).
 *
 * Unverified emails are never linked or provisioned.
 */
export async function ensureAilaIdentity(authUser: NeonAuthUser) {
  if (!authUser.id) {
    throw new Error('Authenticated Neon Auth user is missing an ID');
  }

  const email = authUser.email;

  if (!email) {
    throw new Error('Authenticated Neon Auth user is missing an email address');
  }

  const existing = await getDb().user.findUnique({
    where: { authUserId: authUser.id },
    include: identityInclude,
  });

  if (existing) {
    return existing;
  }

  if (!authUser.emailVerified) {
    throw new AuthIdentityError('EMAIL_NOT_VERIFIED');
  }

  const relinked = await relinkByVerifiedEmail(authUser, email);

  if (relinked) {
    return relinked;
  }

  return getDb().$transaction(async (tx) => {
    const raced = await tx.user.findUnique({
      where: { authUserId: authUser.id },
      include: identityInclude,
    });

    if (raced) {
      return raced;
    }

    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);

    const displayName =
      typeof authUser.name === 'string' ? authUser.name.trim() : null;

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
        // Neon Auth exposes verification as a boolean; record when Aila
        // first saw the verified email.
        emailVerifiedAt: now,
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

    const trial = await tx.trial.create({
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
          source: 'NEON_AUTH_PROVISIONING',
        },
      },
    });

    await tx.auditLog.create({
      data: auditLogData({
        action: 'CREATE',
        result: 'SUCCESS',
        accountId: account.id,
        userId: user.id,
        resourceType: 'TRIAL',
        resourceId: trial.id,
        metadata: { event: 'TRIAL_STARTED', expiresAt: trialExpiresAt.toISOString() },
      }),
    });

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      include: identityInclude,
    });
  });
}

async function relinkByVerifiedEmail(authUser: NeonAuthUser, email: string) {
  return getDb().$transaction(async (tx) => {
    const linked = await tx.user.findUnique({
      where: { authUserId: authUser.id },
      include: identityInclude,
    });

    if (linked) {
      return linked;
    }

    const matches = await tx.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, accountId: true, authUserId: true, emailVerifiedAt: true },
      take: 2,
    });

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      // Ambiguous: never guess which account the person owns.
      throw new AuthIdentityError('ACCOUNT_LINK_CONFLICT');
    }

    const [match] = matches as [(typeof matches)[number]];
    const now = new Date();

    await tx.user.update({
      where: { id: match.id },
      data: {
        authUserId: authUser.id,
        emailVerifiedAt: match.emailVerifiedAt ?? now,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: match.accountId,
        userId: match.id,
        action: 'UPDATE',
        severity: 'WARNING',
        resourceType: 'USER',
        resourceId: match.id,
        metadata: {
          source: 'NEON_AUTH_RELINK',
          reason: 'VERIFIED_EMAIL_MATCH',
          previousAuthUserId: match.authUserId,
        },
      },
    });

    return tx.user.findUniqueOrThrow({
      where: { id: match.id },
      include: identityInclude,
    });
  });
}
