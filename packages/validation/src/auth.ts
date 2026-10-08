import { z } from 'zod';

/**
 * Shared validation schemas (APPLICATION-ARCHITECTURE §14, §45, §54).
 * Used by server actions; the same rules are mirrored by form attributes.
 */

export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }).max(254));

// Better Auth email/password defaults: 8 to 128 characters.
export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  .min(8, { error: 'Password must contain at least 8 characters.' })
  .max(128, { error: 'Password must contain at most 128 characters.' });

export const displayNameSchema = z
  .string()
  .trim()
  .max(100, { error: 'Name must contain at most 100 characters.' });

export const otpSchema = z
  .string({ error: 'Enter the code from your email.' })
  .trim()
  .regex(/^\d{6}$/, { error: 'Enter the 6-digit code from your email.' });

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, { error: 'Enter your password.' })
    .max(128, { error: 'Email or password is incorrect.' }),
});

export const signUpSchema = z
  .object({
    name: displayNameSchema.optional().default(''),
    email: emailSchema,
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    error: 'Passwords do not match.',
    path: ['confirmation'],
  });

export const verifyEmailSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

export const emailOnlySchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z
      .string({ error: 'The reset link is invalid or has expired.' })
      .min(1, { error: 'The reset link is invalid or has expired.' })
      .max(512, { error: 'The reset link is invalid or has expired.' }),
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    error: 'Passwords do not match.',
    path: ['confirmation'],
  });

/** First validation message, safe to show to the user. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the form and try again.';
}
