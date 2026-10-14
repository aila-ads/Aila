import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@aila/auth/server';
import { SignupForm } from './signup-form';
import { Crest } from '../../components/brand/crest';
import { OrnamentRule } from '../../components/brand/ornament-rule';
import { Wordmark } from '../../components/brand/wordmark';
import { SiteFooter } from '../../components/legal/site-footer';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await getSessionUser().catch(() => null)) {
    redirect('/dashboard');
  }

  return (
    <main className="auth-page">
      <div className="brand-lockup">
        <Crest className="size-16" />
        <Wordmark className="text-3xl" />
      </div>
      <OrnamentRule className="mb-2" />
      <h1>Create your Aila account</h1>
      <p>Your account starts with a 3-hour Aila trial.</p>
      <SignupForm />
      <p className="legal-consent">
        By creating an account you agree to the <Link href="/terms">Terms of Service</Link> and{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <SiteFooter className="sm:flex-col sm:justify-center sm:text-center" />
    </main>
  );
}
