import { AppError } from '@aila/validation';
import { getAuth } from './server';
import type { NeonAuthUser } from './identity';

export type SessionState = {
  readonly user: NeonAuthUser;
  readonly session: { readonly id: string; readonly expiresAt: Date };
};

/**
 * The current Neon Auth session, validated server-side
 * (SECURITY-ARCHITECTURE §6.1). Returns null when there is no valid
 * session. The session token is never returned.
 */
export async function getSessionState(): Promise<SessionState | null> {
  const { data, error } = await getAuth().getSession();

  if (error) {
    console.error('[auth] Session lookup failed', { code: error.code });
    throw new AppError('DEPENDENCY_FAILURE', { reason: 'SESSION_LOOKUP_FAILED' });
  }

  const user = data?.user;
  const session = data?.session;

  if (!user || !session) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified === true,
      name: user.name ?? null,
    },
    session: { id: session.id, expiresAt: new Date(session.expiresAt) },
  };
}

/** The current Neon Auth user, or null when signed out. */
export async function getSessionUser(): Promise<NeonAuthUser | null> {
  return (await getSessionState())?.user ?? null;
}
