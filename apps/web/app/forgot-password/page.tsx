import { ForgotPasswordForm } from './forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <p className="wordmark">Aila</p>
      <h1>Reset your password</h1>
      <p>Enter your account email and we will send you a reset link.</p>
      <ForgotPasswordForm />
    </main>
  );
}
