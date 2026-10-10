import { describe, expect, it } from 'vitest';
import { isPublicPath } from '../../../apps/web/lib/public-paths';

describe('isPublicPath', () => {
  it('lets anyone read the Privacy Policy and Terms of Service', () => {
    expect(isPublicPath('/privacy')).toBe(true);
    expect(isPublicPath('/terms')).toBe(true);
  });

  it('keeps the account pages and provider callbacks public', () => {
    for (const path of [
      '/',
      '/login',
      '/signup',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/api/auth/get-session',
      '/api/trpc/account.me',
      '/api/intelligence/messages',
      '/api/intelligence/transcribe',
      '/api/writer/assist',
      '/api/webhooks/flutterwave',
      '/api/webhooks/paystack',
      '/api/webhooks/paypal',
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it('requires a session everywhere else (deny by default)', () => {
    for (const path of [
      '/dashboard',
      '/settings',
      '/billing',
      '/files',
      '/writer',
      '/writer/0192/0193',
      '/intelligence',
      '/auth/callback',
      '/privacy/extra',
      '/terms/',
      '/privacy-policy',
      '/api/webhooks/other',
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
