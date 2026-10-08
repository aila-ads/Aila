import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createAuthServerClientFromCookieStore,
  ensureAilaIdentity,
} from '@aila/auth/server';
import {
  Card,
  CardDescription,
  CardHeader,
} from '@aila/ui/components/card';

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
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">
            Welcome to Aila
          </h1>
          <p className="font-medium">{identity.name || identity.email}</p>
          <CardDescription>Your Aila account is ready.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
