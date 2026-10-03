import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { ensureAilaIdentity } from '@aila/auth/server';

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase authentication environment is not configured');
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Session refresh is handled by the Next.js proxy.
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Authenticated session could not be established');
  }

  const identity = await ensureAilaIdentity(user);

  return (
    <main>
      <h1>Welcome to Aila</h1>
      <p>{identity.name || identity.email}</p>
      <p>Your Aila account is ready.</p>
    </main>
  );
}
