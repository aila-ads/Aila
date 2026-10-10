import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';
import { Crest } from '../../components/brand/crest';
import { OrnamentRule } from '../../components/brand/ornament-rule';
import { Wordmark } from '../../components/brand/wordmark';
import { SiteFooter } from '../../components/legal/site-footer';

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <div className="brand-lockup">
        <Crest className="size-16" />
        <Wordmark className="text-3xl" />
      </div>
      <OrnamentRule className="mb-2" />
      <h1>Choose a new password</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
      <SiteFooter className="sm:flex-col sm:justify-center sm:text-center" />
    </main>
  );
}
