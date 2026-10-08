import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAuthServerClientFromCookieStore } from '@aila/auth/session';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', requestUrl.origin));
  }

  const cookieStore = await cookies();

  const supabase = createAuthServerClientFromCookieStore(cookieStore);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=auth_callback_failed', requestUrl.origin),
    );
  }

  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
}
