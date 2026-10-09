/**
 * A failed call to Paystack or PayPal. UNAVAILABLE: network failure,
 * timeout, 429 or 5xx; safe to retry. REJECTED: the provider refused the
 * request or answered with an unexpected body. The message carries only
 * the provider, operation and HTTP status, never keys or customer data.
 */
export class PaymentProviderError extends Error {
  readonly kind: 'UNAVAILABLE' | 'REJECTED';
  readonly status: number | null;
  /** The provider's machine-readable error name, when it sent one. */
  readonly issue: string | null;

  constructor(
    provider: 'Paystack' | 'PayPal',
    kind: 'UNAVAILABLE' | 'REJECTED',
    operation: string,
    status: number | null = null,
    issue: string | null = null,
  ) {
    super(`${provider} ${operation} failed (${kind}${status === null ? '' : `, HTTP ${status}`})`);
    this.name = 'PaymentProviderError';
    this.kind = kind;
    this.status = status;
    this.issue = issue;
  }
}

export const PROVIDER_TIMEOUT_MS = 15_000;

/** A provider's verified result for one charge, in Aila's terms. */
export type VerifiedCharge = {
  readonly provider: 'FLUTTERWAVE' | 'PAYSTACK' | 'PAYPAL';
  /** Unique per provider: Flutterwave/Paystack transaction ID, PayPal order ID. */
  readonly providerTransactionId: string;
  /** Aila's reference sent with the checkout. */
  readonly txRef: string;
  readonly amount: number | string;
  readonly currency: string;
  readonly status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  readonly paidAt: Date;
};
