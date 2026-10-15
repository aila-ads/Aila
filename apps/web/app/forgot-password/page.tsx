import { ForgotPasswordForm } from './forgot-password-form';
import { Crest } from '../../components/brand/crest';
import { OrnamentRule } from '../../components/brand/ornament-rule';
import { Wordmark } from '../../components/brand/wordmark';
import { SiteFooter } from '../../components/legal/site-footer';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <div className="brand-lockup">
        <Crest className="size-16" />
        <Wordmark className="text-3xl" />
      </div>
      <OrnamentRule className="mb-2" />
      <h1>Reset your password</h1>
      <p>Enter your account email and we will send you a reset link.</p>
      <ForgotPasswordForm />
      <SiteFooter className="sm:flex-col sm:justify-center sm:text-center" />
    </main>
  );
}
