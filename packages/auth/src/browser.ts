import { createBrowserClient } from "@supabase/ssr";
import { authEnv } from "./env";

export function createAuthBrowserClient() {
  return createBrowserClient(
    authEnv.supabaseUrl,
    authEnv.supabaseAnonKey,
  );
}
