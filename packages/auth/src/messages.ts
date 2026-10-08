/**
 * Generic, user-safe authentication messages (SECURITY-ARCHITECTURE §6.1,
 * §10.2). Provider error text is never shown, so responses do not reveal
 * whether an account exists.
 */
export const AUTH_MESSAGES = {
  invalidCredentials: 'Email or password is incorrect.',
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  unavailable: 'We could not complete the request. Please try again.',
  verificationSent:
    'If this email can be used with Aila, we sent a 6-digit code. Enter it below.',
  verificationRequired:
    'Verify your email to continue. We sent a 6-digit code if one was needed.',
  invalidCode: 'The code is invalid or has expired.',
  resetSent: 'If an account exists for that email, we sent a password reset link.',
  resetInvalid: 'The reset link is invalid or has expired. Request a new one.',
  resetDone: 'Your password was changed. Sign in with your new password.',
  googleFailed: 'Google sign-in did not complete. Please try again.',
  accountUnavailable: 'We could not open your Aila account. Please try again later.',
} as const;
