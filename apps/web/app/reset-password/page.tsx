import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <p className="wordmark">Aila</p>
      <h1>Choose a new password</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
