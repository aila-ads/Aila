import { z } from 'zod';
import { displayNameSchema, passwordSchema } from './auth';

/**
 * Account self-service input (AILA-V1-SCOPE §5, PRODUCT-SPEC §24). Objects
 * are strict: unknown fields are rejected rather than ignored
 * (SECURITY-ARCHITECTURE §10.1, PLATFORM-FOUNDATION §32).
 */

/** Interface languages Aila supports. English is the only UI language today. */
export const SUPPORTED_LOCALES = ['en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Returns the canonical IANA time zone name, or null if it is not valid. */
export function canonicalTimeZone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

export const timeZoneSchema = z
  .string({ error: 'Choose a time zone.' })
  .trim()
  .min(1, { error: 'Choose a time zone.' })
  .max(64, { error: 'Choose a valid time zone.' })
  .transform((value, context) => {
    const canonical = canonicalTimeZone(value);

    if (!canonical) {
      context.addIssue({ code: 'custom', message: 'Choose a valid time zone.' });
      return z.NEVER;
    }

    return canonical;
  });

export const updateProfileSchema = z.strictObject({
  displayName: displayNameSchema.min(1, { error: 'Enter your name.' }),
});

export const updateSettingsSchema = z.strictObject({
  locale: z.enum(SUPPORTED_LOCALES, { error: 'Choose a supported language.' }),
  timezone: timeZoneSchema,
});

export const revokeSessionSchema = z.strictObject({
  sessionId: z
    .string({ error: 'Choose a session.' })
    .min(1, { error: 'Choose a session.' })
    .max(128, { error: 'Choose a session.' }),
});

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z
      .string({ error: 'Enter your current password.' })
      .min(1, { error: 'Enter your current password.' })
      .max(128, { error: 'Current password is incorrect.' }),
    newPassword: passwordSchema,
    confirmation: z.string({ error: 'Confirm your new password.' }),
  })
  .refine((value) => value.newPassword === value.confirmation, {
    error: 'Passwords do not match.',
    path: ['confirmation'],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
