/**
 * Server-only Flutterwave configuration (SECURITY-ARCHITECTURE §22,
 * APPLICATION-ARCHITECTURE §33-34). Read when billing is first used at
 * runtime, never at build time and never with a NEXT_PUBLIC_ prefix.
 * Production only: test-mode secret keys are refused.
 */

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConfigError';
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new BillingConfigError(`${name} is required`);
  }

  return value;
}

/** Live secret keys start with FLWSECK-; test keys start with FLWSECK_TEST-. */
export function getFlutterwaveSecretKey(): string {
  const secretKey = required('FLUTTERWAVE_SECRET_KEY');

  if (!secretKey.startsWith('FLWSECK-')) {
    throw new BillingConfigError('FLUTTERWAVE_SECRET_KEY must be a live secret key');
  }

  return secretKey;
}

/** The secret hash set on the Flutterwave webhook (sent as `verif-hash`). */
export function getWebhookSecretHash(): string {
  const hash = required('FLUTTERWAVE_WEBHOOK_SECRET_HASH');

  if (hash.length < 32) {
    throw new BillingConfigError('FLUTTERWAVE_WEBHOOK_SECRET_HASH must contain at least 32 characters');
  }

  return hash;
}

export function getProPlanId(): number {
  const value = required('FLUTTERWAVE_PRO_PLAN_ID');

  if (!/^[1-9][0-9]{0,15}$/.test(value)) {
    throw new BillingConfigError('FLUTTERWAVE_PRO_PLAN_ID must be a Flutterwave payment plan ID');
  }

  return Number(value);
}
