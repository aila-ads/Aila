'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@aila/db';
import {
  emailOnlySchema,
  firstIssueMessage,
  isAppError,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@aila/validation';
import { recordAuthEvent, type AuthMethod } from './audit';
import { assertActiveIdentity } from './context';
import { AuthIdentityError, ensureAilaIdentity, type NeonAuthUser } from './identity';
import { AUTH_MESSAGES } from './messages';
import { clientIpFrom, withinRateLimits } from './rate-limit';
import { getSessionUser } from './request';
import { getAuth } from './server';

/**
 * Server actions for email/password sign-up and sign-in, email
 * verification, password reset and sign-out. All input is validated on the
 * server, all endpoints are rate limited, and every error shown to the user
 * is generic (SECURITY-ARCHITECTURE §6, §10, §26).
 */

export type AuthFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'verify'; readonly email: string; readonly message: string }
  | { readonly status: 'sent'; readonly message: string }
  | { readonly status: 'signed_in' }
  | { readonly status: 'verified' }
  | { readonly status: 'reset_done' };

type ProviderError = { readonly status: number; readonly code?: string };

const fail = (message: string): AuthFormState => ({ status: 'error', message });

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

async function requestIp(): Promise<string> {
  return clientIpFrom(await headers());
}

/** Provider outages and upstream throttling are not reported as bad input. */
function providerUnavailable(error: ProviderError): AuthFormState | null {
  if (error.status === 429) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  if (!error.status || error.status >= 500) {
    console.error('[auth] Neon Auth request failed', {
      status: error.status,
      code: error.code,
    });
    return fail(AUTH_MESSAGES.unavailable);
  }

  return null;
}

function toNeonAuthUser(value: unknown): NeonAuthUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const user = value as Record<string, unknown>;

  if (typeof user.id !== 'string' || typeof user.email !== 'string') {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified === true,
    name: typeof user.name === 'string' ? user.name : null,
  };
}

/**
 * Links or provisions the Aila identity for a freshly signed-in user,
 * refuses suspended or deleted accounts, and audits the sign-in. If the
 * identity cannot be resolved or is refused, the new session is ended so no
 * half-signed-in state remains.
 */
async function completeSignIn(
  authUser: NeonAuthUser,
  method: AuthMethod,
): Promise<AuthFormState> {
  try {
    const identity = await ensureAilaIdentity(authUser);
    await assertActiveIdentity(identity);

    await recordAuthEvent({
      action: 'LOGIN',
      method,
      accountId: identity.accountId,
      userId: identity.id,
    });

    return { status: 'signed_in' };
  } catch (error) {
    await getAuth().signOut();

    if (error instanceof AuthIdentityError && error.code === 'EMAIL_NOT_VERIFIED') {
      return {
        status: 'verify',
        email: authUser.email,
        message: AUTH_MESSAGES.verificationRequired,
      };
    }

    if (isAppError(error) && error.reason === 'ACCOUNT_RESTRICTED') {
      return fail(AUTH_MESSAGES.accountRestricted);
    }

    console.error('[auth] Could not resolve Aila identity after sign-in', {
      error: error instanceof AuthIdentityError ? error.code : 'UNEXPECTED',
    });
    return fail(AUTH_MESSAGES.accountUnavailable);
  }
}

/** Sends a verification code, within the verification email limits. */
async function sendVerificationCode(email: string, ip: string): Promise<boolean> {
  const allowed = await withinRateLimits([
    ['verificationEmailPerAccount', email],
    ['verificationEmailPerIp', ip],
  ]);

  if (!allowed) {
    return false;
  }

  const { error } = await getAuth().emailOtp.sendVerificationOtp({
    email,
    type: 'email-verification',
  });

  if (error) {
    providerUnavailable(error);
  }

  return true;
}

export async function signInWithEmail(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });

  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error));
  }

  const { email, password } = parsed.data;
  const ip = await requestIp();

  const allowed = await withinRateLimits([
    ['signInPerIp', ip],
    ['signInPerAccount', email],
  ]);

  if (!allowed) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  const auth = getAuth();
  const { data, error } = await auth.signIn.email({ email, password });

  if (error) {
    const unavailable = providerUnavailable(error);

    if (unavailable) {
      return unavailable;
    }

    if (error.code === 'EMAIL_NOT_VERIFIED') {
      const sent = await sendVerificationCode(email, ip);

      return sent
        ? { status: 'verify', email, message: AUTH_MESSAGES.verificationRequired }
        : fail(AUTH_MESSAGES.rateLimited);
    }

    await recordAuthEvent({
      action: 'SECURITY_EVENT',
      event: 'SIGN_IN_FAILED',
      method: 'password',
    });
    return fail(AUTH_MESSAGES.invalidCredentials);
  }

  const authUser = toNeonAuthUser((data as { user?: unknown } | null)?.user);

  if (!authUser) {
    await auth.signOut();
    return fail(AUTH_MESSAGES.unavailable);
  }

  // After a password reset, end every other session (SECURITY-ARCHITECTURE §6.1).
  if (field(formData, 'afterReset') === '1') {
    await auth.revokeOtherSessions();
  }

  return completeSignIn(authUser, 'password');
}

export async function signUpWithEmail(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: field(formData, 'name'),
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    confirmation: field(formData, 'confirmation'),
  });

  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error));
  }

  const { name, email, password } = parsed.data;
  const ip = await requestIp();

  if (!(await withinRateLimits([['signUpPerIp', ip]]))) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  const { error } = await getAuth().signUp.email({ email, password, name });
  const verifyState: AuthFormState = {
    status: 'verify',
    email,
    message: AUTH_MESSAGES.verificationSent,
  };

  if (error) {
    const unavailable = providerUnavailable(error);

    if (unavailable) {
      return unavailable;
    }

    // Same response whether or not the email is already registered, so the
    // form does not reveal which addresses have accounts.
    if (error.code?.startsWith('USER_ALREADY_EXISTS')) {
      return verifyState;
    }

    if (error.code === 'PASSWORD_TOO_SHORT' || error.code === 'PASSWORD_TOO_LONG') {
      return fail('Password must contain 8 to 128 characters.');
    }

    return fail(AUTH_MESSAGES.unavailable);
  }

  if (!(await sendVerificationCode(email, ip))) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  return verifyState;
}

export async function verifyEmailCode(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = verifyEmailSchema.safeParse({
    email: field(formData, 'email'),
    otp: field(formData, 'otp'),
  });

  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error));
  }

  const { email, otp } = parsed.data;
  const ip = await requestIp();

  const allowed = await withinRateLimits([
    ['verifyPerAccount', email],
    ['signInPerIp', ip],
  ]);

  if (!allowed) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  const { data, error } = await getAuth().emailOtp.verifyEmail({ email, otp });

  if (error) {
    return providerUnavailable(error) ?? fail(AUTH_MESSAGES.invalidCode);
  }

  const result = data as { token?: unknown; user?: unknown } | null;
  const authUser = toNeonAuthUser(result?.user);

  // Neon Auth signs the user in after verification when that setting is on.
  if (authUser && typeof result?.token === 'string' && result.token) {
    return completeSignIn(authUser, 'email_otp');
  }

  return { status: 'verified' };
}

export async function resendVerificationCode(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse({ email: field(formData, 'email') });

  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error));
  }

  const { email } = parsed.data;

  if (!(await sendVerificationCode(email, await requestIp()))) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  return { status: 'verify', email, message: AUTH_MESSAGES.verificationSent };
}

export async function requestPasswordReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse({ email: field(formData, 'email') });

  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error));
  }

  const { email } = parsed.data;
  const requestHeaders = await headers();
  const ip = clientIpFrom(requestHeaders);

  const allowed = await withinRateLimits([
    ['resetRequestPerAccount', email],
    ['resetRequestPerIp', ip],
  ]);

  if (!allowed) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  // Server actions only run for same-origin requests; Neon Auth also only
  // redirects to its trusted domains.
  const origin = requestHeaders.get('origin');

  if (!origin) {
    return fail(AUTH_MESSAGES.unavailable);
  }

  const { error } = await getAuth().requestPasswordReset({
    email,
    redirectTo: new URL('/reset-password', origin).toString(),
  });

  if (error) {
    const unavailable = providerUnavailable(error);

    if (unavailable) {
      return unavailable;
    }
  }

  return { status: 'sent', message: AUTH_MESSAGES.resetSent };
}

export async function resetPassword(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: field(formData, 'token'),
    password: field(formData, 'password'),
    confirmation: field(formData, 'confirmation'),
  });

  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error));
  }

  const { token, password } = parsed.data;

  if (!(await withinRateLimits([['resetSubmitPerIp', await requestIp()]]))) {
    return fail(AUTH_MESSAGES.rateLimited);
  }

  const { error } = await getAuth().resetPassword({ newPassword: password, token });

  if (error) {
    const unavailable = providerUnavailable(error);

    if (unavailable) {
      return unavailable;
    }

    if (error.code === 'PASSWORD_TOO_SHORT' || error.code === 'PASSWORD_TOO_LONG') {
      return fail('Password must contain 8 to 128 characters.');
    }

    return fail(AUTH_MESSAGES.resetInvalid);
  }

  return { status: 'reset_done' };
}

export async function signOut(): Promise<void> {
  let accountId: string | null = null;
  let userId: string | null = null;

  try {
    const authUser = await getSessionUser();

    if (authUser) {
      const user = await getDb().user.findUnique({
        where: { authUserId: authUser.id },
        select: { id: true, accountId: true },
      });

      accountId = user?.accountId ?? null;
      userId = user?.id ?? null;
    }
  } catch {
    // Signing out must still work if the lookup fails.
  }

  const { error } = await getAuth().signOut();

  if (error) {
    console.error('[auth] Neon Auth sign-out failed', {
      status: error.status,
      code: error.code,
    });
  }

  await recordAuthEvent({ action: 'LOGOUT', accountId, userId });

  redirect('/login');
}
