import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthEnv } from './env';

export type AuthCookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: {
      name: string;
      value: string;
      options: CookieOptions;
    }[],
  ) => void;
};

/**
 * Minimal shape of the cookie store returned by `cookies()` from
 * `next/headers`, declared structurally so this package does not depend on
 * Next.js.
 */
export type AuthCookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options?: CookieOptions) => unknown;
};

/**
 * Creates a server-side Supabase client from an explicit cookie adapter.
 * This module does not import the database, so it is safe to use from the
 * Next.js proxy.
 */
export function createAuthServerClient(
  cookies: AuthCookieAdapter,
): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getAuthEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: cookies.getAll,
      setAll: cookies.setAll,
    },
  });
}

/**
 * Creates a server-side Supabase client backed by the Next.js cookie store.
 *
 * - `readOnly: true` for Server Components, which cannot write cookies
 *   (session refresh is handled by the proxy).
 * - `readOnly: false` (default) for Route Handlers and Server Actions.
 */
export function createAuthServerClientFromCookieStore(
  cookieStore: AuthCookieStore,
  { readOnly = false }: { readOnly?: boolean } = {},
): SupabaseClient {
  return createAuthServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      if (readOnly) {
        return;
      }

      for (const { name, value, options } of cookiesToSet) {
        cookieStore.set(name, value, options);
      }
    },
  });
}
