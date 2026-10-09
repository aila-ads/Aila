import { VerifyEmailForm } from '../../components/auth/verify-email-form';
import { Crest } from '../../components/brand/crest';
import { OrnamentRule } from '../../components/brand/ornament-rule';
import { Wordmark } from '../../components/brand/wordmark';
import { SiteFooter } from '../../components/legal/site-footer';

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <div className="brand-lockup">
        <Crest className="size-16" />
        <Wordmark className="text-3xl" />
      </div>
      <OrnamentRule className="mb-2" />
      <h1>Verify your email</h1>
      <p>Enter the 6-digit code we emailed you, or request a new one.</p>
      <VerifyEmailForm />
      <SiteFooter className="sm:flex-col sm:justify-center sm:text-center" />
    </main>
  );
}
