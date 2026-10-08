import { describe, expect, it } from 'vitest';
import {
  canonicalTimeZone,
  changePasswordSchema,
  revokeSessionSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '../../../packages/validation/src/account';
import { AppError, isAppError } from '../../../packages/validation/src/errors';

describe('updateProfileSchema', () => {
  it('trims the display name', () => {
    expect(updateProfileSchema.parse({ displayName: '  Sam  ' })).toEqual({
      displayName: 'Sam',
    });
  });

  it('rejects empty and overlong names', () => {
    expect(updateProfileSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(
      updateProfileSchema.safeParse({ displayName: 'Sam', accountId: 'account_2' }).success,
    ).toBe(false);
  });
});

describe('updateSettingsSchema', () => {
  it('accepts a supported locale and canonicalises the time zone', () => {
    const result = updateSettingsSchema.parse({ locale: 'en-US', timezone: 'asia/dubai' });
    expect(result).toEqual({ locale: 'en-US', timezone: 'Asia/Dubai' });
  });

  it('rejects unsupported locales and unknown time zones', () => {
    expect(
      updateSettingsSchema.safeParse({ locale: 'fr-FR', timezone: 'UTC' }).success,
    ).toBe(false);
    expect(
      updateSettingsSchema.safeParse({ locale: 'en-US', timezone: 'Mars/Olympus' }).success,
    ).toBe(false);
  });

  it('returns null for invalid zones', () => {
    expect(canonicalTimeZone('Not/AZone')).toBeNull();
    expect(canonicalTimeZone('UTC')).toBe('UTC');
  });
});

describe('revokeSessionSchema', () => {
  it('requires a bounded session ID', () => {
    expect(revokeSessionSchema.safeParse({ sessionId: 'abc' }).success).toBe(true);
    expect(revokeSessionSchema.safeParse({ sessionId: '' }).success).toBe(false);
    expect(revokeSessionSchema.safeParse({ sessionId: 'a'.repeat(129) }).success).toBe(false);
    expect(revokeSessionSchema.safeParse({ sessionId: 'abc', token: 't' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const valid = {
    currentPassword: 'current-password',
    newPassword: 'new-password-1',
    confirmation: 'new-password-1',
  };

  it('accepts a valid change', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('requires the confirmation to match', () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmation: 'other-password' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Passwords do not match.');
  });

  it('enforces the password length policy', () => {
    expect(
      changePasswordSchema.safeParse({ ...valid, newPassword: 'short', confirmation: 'short' })
        .success,
    ).toBe(false);
  });

  it('requires the current password', () => {
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(false);
  });
});

describe('AppError', () => {
  it('uses a generic message unless a safe one is given', () => {
    expect(new AppError('NOT_FOUND').message).toBe('We could not find that.');
    expect(new AppError('FORBIDDEN', { message: 'Custom.' }).message).toBe('Custom.');
  });

  it('is recognised across module copies', () => {
    const foreign = Object.assign(new Error('x'), { name: 'AppError', code: 'CONFLICT' });
    expect(isAppError(new AppError('CONFLICT'))).toBe(true);
    expect(isAppError(foreign)).toBe(true);
    expect(isAppError(Object.assign(new Error('x'), { name: 'AppError', code: 'NOPE' }))).toBe(
      false,
    );
    expect(isAppError(new Error('x'))).toBe(false);
  });
});
