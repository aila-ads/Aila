import { createNeonAuth } from '@neondatabase/auth/next/server';
import { getAuthEnv } from './env';

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

/**
 * The single Neon Auth (Managed Better Auth) instance: server methods,
 * the /api/auth proxy handler and the route-protection middleware.
 * Created on first use so configuration is read at runtime only.
 */
export function getAuth(): NeonAuth {
  if (!instance) {
    const { baseUrl, cookieSecret } = getAuthEnv();

    instance = createNeonAuth({
      baseUrl,
      cookies: { secret: cookieSecret },
    });
  }

  return instance;
}
