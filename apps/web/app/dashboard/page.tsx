import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createAuthServerClientFromCookieStore,
  ensureAilaIdentity,
} from '@aila/auth/server';

export default async function DashboardPage() {
  const cookieStore = await cookies();

  // Server Components cannot write cookies; session refresh is handled by
  // the Next.js proxy.
  const supabase = createAuthServerClientFromCookieStore(cookieStore, {
    readOnly: true,
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    // Signed-out (or expired) sessions go back to sign-in instead of
    // crashing the page.
    redirect('/login?redirect=/dashboard');
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
