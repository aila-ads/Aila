import { getAuth } from './server';
import { ensureAilaIdentity, type NeonAuthUser } from './identity';

/**
 * The current Neon Auth user, validated server-side (SECURITY-ARCHITECTURE
 * §6.1). Returns null when there is no valid session.
 */
export async function getSessionUser(): Promise<NeonAuthUser | null> {
  const { data, error } = await getAuth().getSession();

  if (error) {
    console.error('[auth] Session lookup failed', { code: error.code });
    throw new Error('Authentication lookup failed');
  }

  const user = data?.user;

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified === true,
    name: user.name ?? null,
  };
}

/**
 * Resolves Identity -> Aila User -> Aila Account for the current request
 * (APPLICATION-ARCHITECTURE §22). Returns null when signed out.
 */
export async function getAilaIdentity() {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  return ensureAilaIdentity(user);
}
