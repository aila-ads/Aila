import { createBrowserClient } from "@supabase/ssr";
import { getAuthEnv } from "./env";

export function createAuthBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getAuthEnv();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
