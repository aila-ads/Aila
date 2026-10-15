import { getDb } from '@aila/db';
import {
  AppError,
  type ChangePasswordInput,
  type RevokeSessionInput,
  type UpdateProfileInput,
  type UpdateSettingsInput,
} from '@aila/validation';
import { auditLogData, recordAuditEvent } from './audit';
import { deviceLabel } from './device';
import { accountScope, authorize, type AccountContext } from './policies';
import { withinRateLimits } from './rate-limit';
import { getAuth } from './server';

/**
 * Account self-service: profile, settings, sessions and password
 * (AILA-V1-SCOPE §5, PRODUCT-SPEC §24, PLATFORM-FOUNDATION §32).
 *
 * Every function takes the trusted `AccountContext`; the account and user
 * always come from the session, never from client input (DATABASE-SCHEMA §3).
 */

type ProviderError = { readonly status?: number; readonly code?: string };

/** Neon Auth outages are reported as a dependency failure, never as raw text. */
function providerFailure(operation: string, error: ProviderError): AppError {
  console.error('[account] Neon Auth request failed', {
    operation,
    status: error.status,
    code: error.code,
  });

  return error.status === 429
    ? new AppError('RATE_LIMITED')
    : new AppError('DEPENDENCY_FAILURE');
}

export type AccountOverview = {
  readonly user: { readonly displayName: string | null; readonly email: string };
  readonly account: { readonly id: string };
  readonly membershipRole: AccountContext['membership']['role'];
  readonly settings: { readonly locale: string; readonly timezone: string };
};

export async function getAccountOverview(ctx: AccountContext): Promise<AccountOverview> {
  const settings = await getDb().userSettings.findFirst({
    where: { ...accountScope(ctx), userId: ctx.user.id },
    select: { locale: true, timezone: true },
  });

  return {
    user: { displayName: ctx.user.name, email: ctx.user.email },
    account: { id: ctx.account.id },
    membershipRole: ctx.membership.role,
    settings: {
      locale: settings?.locale ?? 'en-US',
      timezone: settings?.timezone ?? 'UTC',
    },
  };
}

/**
 * Updates the display name. The Aila database is authoritative
 * (PLATFORM-FOUNDATION §4); the name is then copied to Neon Auth so its
 * emails greet the person correctly.
 */
export async function updateProfile(
  ctx: AccountContext,
  input: UpdateProfileInput,
  requestId: string,
): Promise<{ readonly displayName: string }> {
  await getDb().$transaction([
    getDb().user.update({
      where: { id: ctx.user.id, accountId: ctx.account.id },
      data: { name: input.displayName },
    }),
    getDb().auditLog.create({
      data: auditLogData({
        action: 'UPDATE',
        result: 'SUCCESS',
        accountId: ctx.account.id,
        userId: ctx.user.id,
        resourceType: 'USER',
        resourceId: ctx.user.id,
        requestId,
        metadata: { fields: ['displayName'] },
      }),
    }),
  ]);

  const { error } = await getAuth().updateUser({ name: input.displayName });

  if (error) {
    // The Aila profile is already saved; Neon Auth's copy is only used in
    // its emails and is updated again on the next change.
    console.error('[account] Could not copy display name to Neon Auth', {
      requestId,
      status: error.status,
      code: error.code,
    });
  }

  return { displayName: input.displayName };
}

/** Updates locale and time zone. Only validated, known settings are stored. */
export async function updateSettings(
  ctx: AccountContext,
  input: UpdateSettingsInput,
  requestId: string,
): Promise<{ readonly locale: string; readonly timezone: string }> {
  const [settings] = await getDb().$transaction([
    getDb().userSettings.upsert({
      where: { userId: ctx.user.id },
      create: {
        accountId: ctx.account.id,
        userId: ctx.user.id,
        locale: input.locale,
        timezone: input.timezone,
      },
      update: { locale: input.locale, timezone: input.timezone },
      select: { accountId: true, locale: true, timezone: true },
    }),
    getDb().auditLog.create({
      data: auditLogData({
        action: 'UPDATE',
        result: 'SUCCESS',
        accountId: ctx.account.id,
        userId: ctx.user.id,
        resourceType: 'USER_SETTINGS',
        resourceId: ctx.user.id,
        requestId,
        metadata: { fields: ['locale', 'timezone'] },
      }),
    }),
  ]);

  // The settings row is unique per user; it must also belong to this account.
  if (settings.accountId !== ctx.account.id) {
    throw new AppError('INTERNAL_ERROR', { reason: 'SETTINGS_ACCOUNT_MISMATCH' });
  }

  return { locale: settings.locale, timezone: settings.timezone };
}

export type AccountSession = {
  readonly id: string;
  readonly current: boolean;
  readonly device: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
};

/** The user's sessions from Neon Auth, including tokens: server-only. */
async function providerSessions() {
  const { data, error } = await getAuth().listSessions();

  if (error) {
    throw providerFailure('listSessions', error);
  }

  return data ?? [];
}

/**
 * The signed-in user's sessions. Session tokens never leave the server
 * (SECURITY-ARCHITECTURE §6.2); IP addresses are not shown.
 */
export async function listSessions(ctx: AccountContext): Promise<AccountSession[]> {
  const sessions = await providerSessions();

  return sessions
    .map((session) => ({
      id: session.id,
      current: session.id === ctx.session.id,
      device: deviceLabel(session.userAgent),
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
    }))
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt),
    );
}

/**
 * Signs out one of the user's other sessions. The session is looked up
 * among the user's own sessions; an unknown ID is reported as not found.
 * The current session is ended with Sign out instead.
 */
export async function revokeSession(
  ctx: AccountContext,
  input: RevokeSessionInput,
  requestId: string,
): Promise<{ readonly revoked: true }> {
  if (input.sessionId === ctx.session.id) {
    throw new AppError('VALIDATION_ERROR', {
      reason: 'CURRENT_SESSION',
      message: 'Use Sign out to end the session on this device.',
    });
  }

  const target = (await providerSessions()).find(
    (session) => session.id === input.sessionId,
  );

  authorize(target !== undefined, 'NOT_FOUND');

  const { error } = await getAuth().revokeSession({ token: target.token });

  if (error) {
    throw providerFailure('revokeSession', error);
  }

  await recordAuditEvent({
    action: 'SECURITY_EVENT',
    result: 'SUCCESS',
    severity: 'INFO',
    accountId: ctx.account.id,
    userId: ctx.user.id,
    resourceType: 'SESSION',
    resourceId: input.sessionId,
    requestId,
    metadata: { event: 'SESSION_REVOKED' },
  });

  return { revoked: true };
}

/** Whether the user signs in with a password (as opposed to Google only). */
export async function getPasswordStatus(
  _ctx: AccountContext,
): Promise<{ readonly hasPassword: boolean }> {
  const { data, error } = await getAuth().listAccounts();

  if (error) {
    throw providerFailure('listAccounts', error);
  }

  return {
    hasPassword: (data ?? []).some((entry) => entry.providerId === 'credential'),
  };
}

/**
 * Changes the password and signs out every other session
 * (SECURITY-ARCHITECTURE §6.1: invalidate sessions after security events).
 */
export async function changePassword(
  ctx: AccountContext,
  input: ChangePasswordInput,
  requestId: string,
): Promise<{ readonly changed: true }> {
  if (!(await withinRateLimits([['passwordChangePerAccount', ctx.user.id]]))) {
    throw new AppError('RATE_LIMITED');
  }

  if (!(await getPasswordStatus(ctx)).hasPassword) {
    throw new AppError('VALIDATION_ERROR', {
      reason: 'NO_PASSWORD',
      message: 'This account signs in with Google, so it has no Aila password.',
    });
  }

  const { error } = await getAuth().changePassword({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    revokeOtherSessions: true,
  });

  if (error) {
    if (error.status && error.status < 500 && error.status !== 429) {
      await recordAuditEvent({
        action: 'PASSWORD_CHANGE',
        result: 'FAILURE',
        accountId: ctx.account.id,
        userId: ctx.user.id,
        resourceType: 'USER',
        resourceId: ctx.user.id,
        requestId,
      });

      throw new AppError('VALIDATION_ERROR', {
        reason: 'PASSWORD_CHANGE_REJECTED',
        message:
          error.code === 'PASSWORD_TOO_SHORT' || error.code === 'PASSWORD_TOO_LONG'
            ? 'Password must contain 8 to 128 characters.'
            : 'Current password is incorrect.',
      });
    }

    throw providerFailure('changePassword', error);
  }

  await recordAuditEvent({
    action: 'PASSWORD_CHANGE',
    result: 'SUCCESS',
    accountId: ctx.account.id,
    userId: ctx.user.id,
    resourceType: 'USER',
    resourceId: ctx.user.id,
    requestId,
    metadata: { otherSessionsRevoked: true },
  });

  return { changed: true };
}
