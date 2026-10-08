// Supabase session helpers with no database dependency.
// Safe to import from the Next.js proxy and from route handlers.
export {
  createAuthServerClient,
  createAuthServerClientFromCookieStore,
} from './server';
export type { AuthCookieAdapter, AuthCookieStore } from './server';
