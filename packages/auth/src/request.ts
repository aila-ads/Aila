import { createAuthServerClient } from './server';
import { ensureAilaIdentity } from './identity';

export async function getAilaIdentity(
  cookies: Parameters<typeof createAuthServerClient>[0],
) {
  const supabase = createAuthServerClient(cookies);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Authentication lookup failed: ${error.message}`);
  }

  if (!user) {
    return null;
  }

  return ensureAilaIdentity(user);
}
