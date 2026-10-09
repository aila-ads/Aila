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

/** Whether every named variable is set; used to show only configured providers. */
export function isConfigured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export const FLUTTERWAVE_ENV = ['FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_PRO_PLAN_ID'] as const;
/** Paystack charges the Aila Pro price of the Flutterwave plan, in the same currency. */
export const PAYSTACK_ENV = ['PAYSTACK_SECRET_KEY', ...FLUTTERWAVE_ENV] as const;
export const PAYPAL_ENV = [
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'AILA_PRO_PRICE_USD',
] as const;

/** Live Paystack secret keys start with sk_live_; test keys are refused. */
export function getPaystackSecretKey(): string {
  const secretKey = required('PAYSTACK_SECRET_KEY');

  if (!secretKey.startsWith('sk_live_')) {
    throw new BillingConfigError('PAYSTACK_SECRET_KEY must be a live secret key');
  }

  return secretKey;
}

export type PaypalConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
};

/** The live REST app's credentials (the API host is always the live one). */
export function getPaypalConfig(): PaypalConfig {
  return { clientId: required('PAYPAL_CLIENT_ID'), clientSecret: required('PAYPAL_CLIENT_SECRET') };
}

/** The ID PayPal shows for the webhook registered on the live app. */
export function getPaypalWebhookId(): string {
  const id = required('PAYPAL_WEBHOOK_ID');

  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) {
    throw new BillingConfigError('PAYPAL_WEBHOOK_ID must be a PayPal webhook ID');
  }

  return id;
}

/** The one-month Aila Pro price charged through PayPal, in US dollars (e.g. 4.00). */
export function getProPriceUsd(): string {
  const value = required('AILA_PRO_PRICE_USD');

  if (!/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$/.test(value) || Number(value) <= 0) {
    throw new BillingConfigError('AILA_PRO_PRICE_USD must be a positive amount such as 4.00');
  }

  return Number(value).toFixed(2);
}
