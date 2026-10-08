export type AuthEnv = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
};

/**
 * Reads the public Supabase configuration.
 *
 * Evaluated lazily (on call, not on import) so a missing variable surfaces as
 * a clear error at the point of use rather than when a module is loaded.
 * The `process.env.NEXT_PUBLIC_*` references must stay literal so Next.js can
 * inline them into browser bundles.
 */
export function getAuthEnv(): AuthEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }

  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  }

  return { supabaseUrl, supabaseAnonKey };
}
