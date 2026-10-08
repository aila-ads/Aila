import { VerifyEmailForm } from '../../components/auth/verify-email-form';

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <p className="wordmark">Aila</p>
      <h1>Verify your email</h1>
      <p>Enter the 6-digit code we emailed you, or request a new one.</p>
      <VerifyEmailForm />
    </main>
  );
}
