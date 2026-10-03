import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authEnv } from './env';

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

export function createAuthServerClient(
  cookies: AuthCookieAdapter,
): SupabaseClient {
  return createServerClient(
    authEnv.supabaseUrl,
    authEnv.supabaseAnonKey,
    {
      cookies: {
        getAll: cookies.getAll,
        setAll: cookies.setAll,
      },
    },
  );
}
