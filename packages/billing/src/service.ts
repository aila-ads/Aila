import { randomUUID } from 'node:crypto';
import {
  accountScope,
  auditLogData,
  authorize,
  isAccountOwner,
  recordAuditEvent,
  withinRateLimits,
  type AccountContext,
} from '@aila/auth/server';
import { getDb, type Prisma } from '@aila/db';
import { AppError } from '@aila/validation';
import {
  BillingConfigError,
  FLUTTERWAVE_ENV,
  getProPlanId,
  getProPriceUsd,
  isConfigured,
  PAYPAL_ENV,
  PAYSTACK_ENV,
} from './env';
import {
  cancelProviderSubscription,
  createCheckout,
  findSubscriptions,
  FlutterwaveError,
  getPlan,
  verifyTransaction,
  type FlutterwavePlan,
  type FlutterwaveTransaction,
} from './flutterwave';
import { capturePaypalOrder, createPaypalOrder, isPaypalUrl } from './paypal';
import { initializePaystackTransaction, verifyPaystackTransaction } from './paystack';
import { PaymentProviderError, type VerifiedCharge } from './provider-error';
import {
  accessUntil,
  addBillingPeriod,
  canCancel,
  cancellationUpdate,
  canStartCheckout,
  CHECKOUT_SESSION_MINUTES,
  checkCharge,
  checkPlan,
  checkVerifiedCharge,
  failedChargeMakesPastDue,
  oneMonthAccess,
  oneMonthRefusal,
  renewedPeriod,
  subscriptionState,
  toMinorUnits,
  type AmountDetail,
  type ChargeCheck,
  type SubscriptionState,
} from './state';

/**
 * The Aila Billing Service (PLATFORM-FOUNDATION §13-15,
 * APPLICATION-ARCHITECTURE §17, AILA-V1-ARCHITECTURE §17). Owns checkout,
 * payment verification, subscription state and cancellation. Pro access
 * itself is decided by the entitlement service from the Subscription rows
 * written here; the browser never reports payment state.
 */

const PROVIDER = 'FLUTTERWAVE';
const PLAN = 'AILA_PRO';
const APP_URL = 'https://ailaxx.com';
const RETURN_PATH = '/billing';
const RETURN_URL = `${APP_URL}${RETURN_PATH}`;
/** Where a customer who abandons a checkout lands. */
const CANCEL_URL = `${RETURN_URL}?checkout=cancelled`;
/** A stored checkout link is reused only if it stays open at least this long. */
const CHECKOUT_REUSE_MARGIN_MS = 5 * 60 * 1000;

const SUBSCRIPTION_SELECT = {
  id: true,
  accountId: true,
  providerSubscriptionId: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  canceledAt: true,
} as const satisfies Prisma.SubscriptionSelect;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'P2002';
}

/** Logs a provider or configuration failure and returns a safe API error. */
function dependencyFailure(operation: string, error: unknown, requestId?: string): AppError {
  console.error('[billing] Operation failed', {
    operation,
    requestId: requestId ?? null,
    error:
      error instanceof FlutterwaveError ||
      error instanceof PaymentProviderError ||
      error instanceof BillingConfigError
        ? error.message
        : error instanceof Error
          ? error.name
          : 'UnknownError',
  });
  return new AppError('DEPENDENCY_FAILURE');
}

async function requireBillingRateLimit(ctx: AccountContext): Promise<void> {
  if (!(await withinRateLimits([['billingPerAccount', ctx.account.id]]))) {
    throw new AppError('RATE_LIMITED');
  }
}

/** The newest Flutterwave card plan subscription (renewed by Flutterwave). */
function latestSubscription(accountId: string, db: Prisma.TransactionClient = getDb()) {
  return db.subscription.findFirst({
    where: { accountId, provider: PROVIDER, plan: PLAN, providerSubscriptionId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: SUBSCRIPTION_SELECT,
  });
}

/** Every Aila Pro row that can still give access: card plan and one-month purchases. */
function accessRows(accountId: string, db: Prisma.TransactionClient = getDb()) {
  return db.subscription.findMany({
    where: { accountId, plan: PLAN, status: 'ACTIVE' },
    select: SUBSCRIPTION_SELECT,
  });
}

/** The configured Aila Pro plan, checked to be active, monthly and priced. */
async function loadPlan(): Promise<FlutterwavePlan> {
  const planId = getProPlanId();
  const plan = await getPlan(planId);
  const check = checkPlan(plan, planId);

  if (!check.ok) {
    throw new BillingConfigError(`Flutterwave plan ${planId} is not usable: ${check.reason}`);
  }

  return plan;
}

// ------------------------------------------------------------------
// Billing page
// ------------------------------------------------------------------

export type BillingPrice = { readonly amount: string; readonly currency: string };

/**
 * How the customer pays. FLUTTERWAVE, PAYSTACK and PAYPAL buy one month with
 * every method the provider offers; FLUTTERWAVE_CARD_PLAN is the monthly card
 * subscription Flutterwave renews until it is cancelled.
 */
export type CheckoutMethod = 'FLUTTERWAVE' | 'PAYSTACK' | 'PAYPAL' | 'FLUTTERWAVE_CARD_PLAN';

export type CheckoutOption = { readonly method: CheckoutMethod; readonly price: BillingPrice };

export type BillingSummary = {
  readonly subscription: {
    readonly state: SubscriptionState;
    readonly currentPeriodEnd: string | null;
    readonly canceledAt: string | null;
    /** The last successful charge. */
    readonly lastCharge: BillingPrice | null;
  } | null;
  /**
   * Paid Aila Pro access from one-month purchases (and a cancelled card plan
   * still running), when no card plan is renewing. Null otherwise.
   */
  readonly prepaidUntil: string | null;
  /** Configured payment methods the owner can use now, with their prices. */
  readonly options: readonly CheckoutOption[];
  /** Whether a configured method exists but its price could not be loaded. */
  readonly optionsUnavailable: boolean;
  /** One month can be bought (or added to the current access) now. */
  readonly canBuy: boolean;
  /** Why buying is refused while Aila Pro is already paid for. */
  readonly buyRefusal: 'RENEWING_SUBSCRIPTION' | 'PREPAID_LIMIT' | null;
  readonly canCancel: boolean;
  /** Only account owners manage billing. */
  readonly isOwner: boolean;
};

function toPrice(amount: number | string, currency: string): BillingPrice {
  return { amount: (toMinorUnits(amount) / 100).toFixed(2), currency };
}

/** Prices of the configured methods; failures are logged and the method left out. */
async function loadOptions(
  includeCardPlan: boolean,
  requestId?: string,
): Promise<{ readonly options: CheckoutOption[]; readonly unavailable: boolean }> {
  const options: CheckoutOption[] = [];
  let unavailable = false;

  if (isConfigured(...FLUTTERWAVE_ENV)) {
    try {
      const plan = await loadPlan();
      const price = toPrice(plan.amount, plan.currency);
      options.push({ method: 'FLUTTERWAVE', price });

      if (isConfigured(...PAYSTACK_ENV)) {
        options.push({ method: 'PAYSTACK', price });
      }

      if (includeCardPlan) {
        options.push({ method: 'FLUTTERWAVE_CARD_PLAN', price });
      }
    } catch (error) {
      unavailable = true;
      dependencyFailure('load plan', error, requestId);
    }
  }

  if (isConfigured(...PAYPAL_ENV)) {
    try {
      options.push({ method: 'PAYPAL', price: { amount: getProPriceUsd(), currency: 'USD' } });
    } catch (error) {
      unavailable = true;
      dependencyFailure('load PayPal price', error, requestId);
    }
  }

  return { options, unavailable };
}

/** Server-resolved billing state for display (AILA-V1-SCOPE §23). */
export async function getBillingSummary(
  ctx: AccountContext,
  requestId?: string,
): Promise<BillingSummary> {
  const now = new Date();
  const [subscription, rows] = await Promise.all([
    latestSubscription(ctx.account.id),
    accessRows(ctx.account.id),
  ]);
  const lastCharge = await getDb().payment.findFirst({
    where: { ...accountScope(ctx), status: 'SUCCEEDED' },
    orderBy: { paidAt: 'desc' },
    select: { amount: true, currency: true },
  });
  const isOwner = isAccountOwner(ctx);
  const renewing = canCancel(subscription, now);
  const until = accessUntil(rows, now);
  const buyRefusal = oneMonthRefusal(subscription, rows, now);
  // The card plan can be chosen only when the account has no paid access.
  const planAllowed = canStartCheckout(subscription, now) && until === null;
  const { options, unavailable } =
    isOwner && buyRefusal === null
      ? await loadOptions(planAllowed, requestId)
      : { options: [], unavailable: false };

  return {
    subscription: subscription
      ? {
          state: subscriptionState(subscription, now),
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          canceledAt: subscription.canceledAt?.toISOString() ?? null,
          lastCharge: lastCharge
            ? { amount: lastCharge.amount.toFixed(2), currency: lastCharge.currency }
            : null,
        }
      : null,
    prepaidUntil: !renewing && until ? until.toISOString() : null,
    options,
    optionsUnavailable: unavailable,
    canBuy: isOwner && buyRefusal === null && options.some((option) => option.method !== 'FLUTTERWAVE_CARD_PLAN'),
    buyRefusal,
    canCancel: isOwner && renewing,
    isOwner,
  };
}

// ------------------------------------------------------------------
// Checkout
// ------------------------------------------------------------------

function isFlutterwaveCheckoutUrl(link: string): boolean {
  const url = new URL(link);
  return url.protocol === 'https:' && (url.hostname === 'flutterwave.com' || url.hostname.endsWith('.flutterwave.com'));
}

function isPaystackCheckoutUrl(link: string): boolean {
  const url = new URL(link);
  return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com';
}

const PROVIDER_OF: Record<Exclude<CheckoutMethod, 'FLUTTERWAVE_CARD_PLAN'>, VerifiedCharge['provider']> = {
  FLUTTERWAVE: 'FLUTTERWAVE',
  PAYSTACK: 'PAYSTACK',
  PAYPAL: 'PAYPAL',
};

const METHOD_ENV: Record<CheckoutMethod, readonly string[]> = {
  FLUTTERWAVE: FLUTTERWAVE_ENV,
  FLUTTERWAVE_CARD_PLAN: FLUTTERWAVE_ENV,
  PAYSTACK: PAYSTACK_ENV,
  PAYPAL: PAYPAL_ENV,
};

/**
 * Starts an Aila Pro checkout (AC-160) with the chosen method. The amount
 * and currency come from the Flutterwave plan or AILA_PRO_PRICE_USD, never
 * from the client, and are stored with the generated reference so the
 * payment can be verified against them.
 */
export async function startCheckout(
  ctx: AccountContext,
  method: CheckoutMethod,
  requestId?: string,
): Promise<{ readonly url: string }> {
  authorize(isAccountOwner(ctx));
  await requireBillingRateLimit(ctx);

  if (!isConfigured(...METHOD_ENV[method])) {
    throw new AppError('CONFLICT', {
      reason: 'METHOD_UNAVAILABLE',
      message: 'This payment method is not available.',
    });
  }

  const db = getDb();
  const now = new Date();
  const [subscription, rows] = await Promise.all([
    latestSubscription(ctx.account.id),
    accessRows(ctx.account.id),
  ]);
  const oneTime = method !== 'FLUTTERWAVE_CARD_PLAN';

  if (oneTime) {
    const refusal = oneMonthRefusal(subscription, rows, now);

    if (refusal) {
      throw new AppError('CONFLICT', {
        reason: refusal,
        message:
          refusal === 'RENEWING_SUBSCRIPTION'
            ? 'Your Aila Pro card subscription already renews every month.'
            : 'Aila Pro is already paid for about a year ahead.',
      });
    }
  } else if (!canStartCheckout(subscription, now) || accessUntil(rows, now) !== null) {
    throw new AppError('CONFLICT', {
      reason: 'SUBSCRIPTION_EXISTS',
      message: 'Your account already has Aila Pro.',
    });
  }

  const provider = oneTime ? PROVIDER_OF[method] : PROVIDER;

  // One open checkout per account and method, so a second tab reuses it.
  const open = await db.payment.findFirst({
    where: {
      ...accountScope(ctx),
      provider,
      oneTime,
      status: 'PENDING',
      checkoutUrl: { not: null },
      checkoutExpiresAt: { gt: new Date(now.getTime() + CHECKOUT_REUSE_MARGIN_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { checkoutUrl: true },
  });

  if (open?.checkoutUrl) {
    return { url: open.checkoutUrl };
  }

  let price: BillingPrice;
  let planId: number | undefined;

  try {
    if (method === 'PAYPAL') {
      price = { amount: getProPriceUsd(), currency: 'USD' };
    } else {
      const plan = await loadPlan();
      price = toPrice(plan.amount, plan.currency);
      planId = oneTime ? undefined : plan.id;
    }
  } catch (error) {
    throw dependencyFailure('load price', error, requestId);
  }

  const payment = await db.payment.create({
    data: {
      accountId: ctx.account.id,
      userId: ctx.user.id,
      provider,
      txRef: `aila-${randomUUID()}`,
      plan: PLAN,
      oneTime,
      amount: price.amount,
      currency: price.currency,
      checkoutExpiresAt: new Date(now.getTime() + CHECKOUT_SESSION_MINUTES * 60_000),
    },
    select: { id: true, txRef: true },
  });

  let url: string;
  let providerTransactionId: string | undefined;

  try {
    if (method === 'PAYSTACK') {
      url = await initializePaystackTransaction({
        reference: payment.txRef,
        amountMinor: toMinorUnits(price.amount),
        currency: price.currency,
        email: ctx.user.email,
        callbackUrl: RETURN_URL,
        cancelUrl: CANCEL_URL,
      });

      if (!isPaystackCheckoutUrl(url)) {
        throw new PaymentProviderError('Paystack', 'REJECTED', 'initialize transaction');
      }
    } else if (method === 'PAYPAL') {
      const order = await createPaypalOrder({
        txRef: payment.txRef,
        amount: price.amount,
        currency: price.currency,
        returnUrl: RETURN_URL,
        cancelUrl: CANCEL_URL,
      });

      if (!isPaypalUrl(order.approveUrl)) {
        throw new PaymentProviderError('PayPal', 'REJECTED', 'create order');
      }

      url = order.approveUrl;
      // The order ID is what PayPal returns the customer and its webhooks with.
      providerTransactionId = order.orderId;
    } else {
      url = await createCheckout({
        txRef: payment.txRef,
        amount: Number(price.amount),
        currency: price.currency,
        planId,
        redirectUrl: RETURN_URL,
        email: ctx.user.email,
        name: ctx.user.name,
        sessionMinutes: CHECKOUT_SESSION_MINUTES,
      });

      if (!isFlutterwaveCheckoutUrl(url)) {
        throw new FlutterwaveError('REJECTED', 'create checkout');
      }
    }
  } catch (error) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    throw dependencyFailure('create checkout', error, requestId);
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { checkoutUrl: url, ...(providerTransactionId ? { providerTransactionId } : {}) },
  });
  await recordAuditEvent({
    action: 'CREATE',
    result: 'SUCCESS',
    accountId: ctx.account.id,
    userId: ctx.user.id,
    resourceType: 'PAYMENT',
    resourceId: payment.id,
    requestId,
    metadata: { event: 'CHECKOUT_STARTED', method },
  });

  return { url };
}

// ------------------------------------------------------------------
// Applying verified transactions
// ------------------------------------------------------------------

export type ApplyResult = {
  /**
   * ACTIVE: paid, Pro is active. PENDING: not final yet. FAILED: not paid.
   * CANCELLED: cancellation recorded. REJECTED: never counted.
   * IGNORED: not about Aila Pro.
   */
  readonly outcome: 'ACTIVE' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'REJECTED' | 'IGNORED';
  readonly errorCode?: string;
  readonly accountId?: string;
  readonly subscriptionId?: string;
};

/** Thrown when the result is not final yet and the caller should retry later. */
export class BillingRetryLater extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BillingRetryLater';
  }
}

async function recordMismatch(
  accountId: string | null,
  transactionId: number | string,
  reason: string,
  requestId?: string,
  detail?: AmountDetail,
): Promise<ApplyResult> {
  await recordAuditEvent({
    action: 'SECURITY_EVENT',
    result: 'DENIED',
    severity: 'CRITICAL',
    accountId,
    resourceType: 'PAYMENT',
    resourceId: String(transactionId),
    requestId,
    metadata: { event: 'PAYMENT_REJECTED', reason, ...(detail ?? {}) },
  });
  // IDs, reason and amounts in minor units only; never keys or customer data.
  console.error('[billing] Transaction rejected', { transactionId, reason, requestId: requestId ?? null, ...(detail ?? {}) });
  return { outcome: 'REJECTED', errorCode: reason, accountId: accountId ?? undefined };
}

function mismatchDetail(check: ChargeCheck): AmountDetail | undefined {
  return check.outcome === 'MISMATCH' && check.reason === 'AMOUNT' ? check.detail : undefined;
}

type CheckoutPayment = {
  readonly id: string;
  readonly accountId: string;
  readonly userId: string | null;
  readonly txRef: string;
  readonly amount: Prisma.Decimal;
  readonly currency: string;
};

/** The first payment of a checkout Aila created: activates Aila Pro. */
async function applyCheckoutPayment(
  payment: CheckoutPayment,
  transaction: FlutterwaveTransaction,
  requestId?: string,
): Promise<ApplyResult> {
  const check = checkCharge(transaction, {
    txRef: payment.txRef,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
  });

  if (check.outcome === 'MISMATCH') {
    return recordMismatch(payment.accountId, transaction.id, `MISMATCH_${check.reason}`, requestId, mismatchDetail(check));
  }

  if (check.outcome === 'PENDING') {
    return { outcome: 'PENDING', accountId: payment.accountId };
  }

  const db = getDb();

  if (check.outcome === 'FAILED') {
    // A later successful attempt on the same checkout still counts.
    await db.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    return { outcome: 'FAILED', accountId: payment.accountId };
  }

  // Flutterwave subscribes the customer to the plan with the first
  // successful charge; the subscription is what renewals and cancellation
  // refer to.
  const planId = getProPlanId();
  const email = transaction.customerEmail?.toLowerCase() ?? null;
  // The newest active subscription of the paying customer, in case the
  // transaction filter ever returns more than the one subscription.
  const providerSubscription = (await findSubscriptions({ planId, transactionId: transaction.id }))
    .filter(
      (item) => item.customerEmail === null || email === null || item.customerEmail.toLowerCase() === email,
    )
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || Number(b.id) - Number(a.id))[0];

  if (!providerSubscription) {
    throw new BillingRetryLater('SUBSCRIPTION_NOT_LINKED');
  }

  const now = new Date();
  const paidAt = transaction.createdAt;

  const result = await db.$transaction(async (tx) => {
    // Exactly one delivery claims the payment (AC-162).
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCEEDED', providerTransactionId: String(transaction.id), paidAt },
    });

    if (claimed.count === 0) {
      return { kind: 'ALREADY_APPLIED' as const };
    }

    const current = await latestSubscription(payment.accountId, tx);

    if (current && !canStartCheckout(current, now)) {
      await tx.auditLog.create({
        data: auditLogData({
          action: 'SUBSCRIPTION_CHANGE',
          result: 'FAILURE',
          severity: 'CRITICAL',
          accountId: payment.accountId,
          resourceType: 'PAYMENT',
          resourceId: payment.id,
          requestId,
          metadata: { event: 'DUPLICATE_PAYMENT_REFUND_REQUIRED', transactionId: transaction.id },
        }),
      });
      return { kind: 'DUPLICATE' as const, subscriptionId: current.id };
    }

    const subscription = await tx.subscription.create({
      data: {
        accountId: payment.accountId,
        provider: PROVIDER,
        providerCustomerId: providerSubscription.customerId,
        providerSubscriptionId: providerSubscription.id,
        plan: PLAN,
        status: 'ACTIVE',
        currentPeriodStart: paidAt,
        currentPeriodEnd: addBillingPeriod(paidAt),
      },
      select: { id: true },
    });

    await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: subscription.id } });
    // The trial has served its purpose; Pro access now comes from the
    // subscription.
    await tx.trial.updateMany({
      where: { accountId: payment.accountId, status: 'ACTIVE' },
      data: { status: 'CONVERTED', endedAt: now },
    });
    await tx.auditLog.create({
      data: auditLogData({
        action: 'SUBSCRIPTION_CHANGE',
        result: 'SUCCESS',
        accountId: payment.accountId,
        userId: payment.userId,
        resourceType: 'SUBSCRIPTION',
        resourceId: subscription.id,
        requestId,
        metadata: { event: 'SUBSCRIPTION_ACTIVATED', from: 'NONE', to: 'ACTIVE' },
      }),
    });

    return { kind: 'ACTIVATED' as const, subscriptionId: subscription.id };
  });

  if (result.kind === 'DUPLICATE') {
    // Stop the second subscription from charging again; the duplicate
    // charge itself must be refunded from the Flutterwave dashboard.
    console.error('[billing] Duplicate payment needs a refund', {
      paymentId: payment.id,
      transactionId: transaction.id,
    });

    try {
      await cancelProviderSubscription(providerSubscription.id);
    } catch (error) {
      dependencyFailure('cancel duplicate subscription', error, requestId);
    }
  }

  return {
    outcome: 'ACTIVE',
    accountId: payment.accountId,
    subscriptionId: result.kind === 'ALREADY_APPLIED' ? undefined : result.subscriptionId,
  };
}

/**
 * A charge Flutterwave made on its own: a renewal of a plan subscription.
 * It is matched to an Aila subscription only through Flutterwave's own
 * subscription records for the plan (SECURITY-ARCHITECTURE §21.1 step 4).
 */
async function applyRenewalCharge(
  transaction: FlutterwaveTransaction,
  requestId?: string,
): Promise<ApplyResult> {
  if (!transaction.customerEmail) {
    return recordMismatch(null, transaction.id, 'UNKNOWN_TRANSACTION', requestId);
  }

  const plan = await loadPlan();
  const providerSubscriptions = await findSubscriptions({
    planId: plan.id,
    email: transaction.customerEmail,
  });
  const db = getDb();
  const subscription = providerSubscriptions.length
    ? await db.subscription.findFirst({
        where: {
          provider: PROVIDER,
          plan: PLAN,
          providerSubscriptionId: { in: providerSubscriptions.map((item) => item.id) },
          status: { in: ['ACTIVE', 'PAST_DUE'] },
        },
        orderBy: { createdAt: 'desc' },
        select: SUBSCRIPTION_SELECT,
      })
    : null;

  if (!subscription) {
    return recordMismatch(null, transaction.id, 'UNKNOWN_TRANSACTION', requestId);
  }

  const check = checkCharge(transaction, { amount: plan.amount, currency: plan.currency });

  if (check.outcome === 'MISMATCH') {
    return recordMismatch(subscription.accountId, transaction.id, `MISMATCH_${check.reason}`, requestId, mismatchDetail(check));
  }

  if (check.outcome === 'PENDING') {
    return { outcome: 'PENDING', accountId: subscription.accountId, subscriptionId: subscription.id };
  }

  const base = { accountId: subscription.accountId, subscriptionId: subscription.id };
  const succeeded = check.outcome === 'SUCCEEDED';

  try {
    await db.$transaction(async (tx) => {
      // The unique transaction ID makes each charge count once (AC-162).
      const charge = await tx.payment.create({
        data: {
          accountId: subscription.accountId,
          subscriptionId: subscription.id,
          provider: PROVIDER,
          txRef: transaction.txRef,
          providerTransactionId: String(transaction.id),
          plan: PLAN,
          amount: (toMinorUnits(transaction.amount) / 100).toFixed(2),
          currency: transaction.currency,
          status: succeeded ? 'SUCCEEDED' : 'FAILED',
          paidAt: succeeded ? transaction.createdAt : null,
        },
        select: { id: true },
      });

      if (succeeded) {
        const period = renewedPeriod(subscription, transaction.createdAt);
        await tx.subscription.updateMany({
          where: { id: subscription.id, status: { in: ['ACTIVE', 'PAST_DUE'] } },
          data: { status: 'ACTIVE', currentPeriodStart: period.start, currentPeriodEnd: period.end },
        });
      } else if (failedChargeMakesPastDue(subscription, transaction.createdAt)) {
        await tx.subscription.updateMany({
          where: { id: subscription.id, status: 'ACTIVE' },
          data: { status: 'PAST_DUE' },
        });
      } else {
        return;
      }

      await tx.auditLog.create({
        data: auditLogData({
          action: 'SUBSCRIPTION_CHANGE',
          result: succeeded ? 'SUCCESS' : 'FAILURE',
          accountId: subscription.accountId,
          resourceType: 'SUBSCRIPTION',
          resourceId: subscription.id,
          requestId,
          metadata: {
            event: succeeded ? 'SUBSCRIPTION_RENEWED' : 'RENEWAL_FAILED',
            from: subscription.status,
            to: succeeded ? 'ACTIVE' : 'PAST_DUE',
            paymentId: charge.id,
          },
        }),
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // Already applied by an earlier delivery.
  }

  return { ...base, outcome: succeeded ? 'ACTIVE' : 'FAILED' };
}

const PAYMENT_SELECT = {
  id: true,
  accountId: true,
  userId: true,
  txRef: true,
  amount: true,
  currency: true,
  status: true,
  oneTime: true,
  providerTransactionId: true,
} as const satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

function flutterwaveCharge(transaction: FlutterwaveTransaction): VerifiedCharge {
  return {
    provider: 'FLUTTERWAVE',
    providerTransactionId: String(transaction.id),
    txRef: transaction.txRef,
    // The price before fees; charged_amount includes fees passed on to the customer.
    amount: transaction.amount,
    chargedAmount: transaction.chargedAmount ?? undefined,
    currency: transaction.currency,
    status:
      transaction.status === 'successful'
        ? 'SUCCEEDED'
        : transaction.status === 'failed'
          ? 'FAILED'
          : 'PENDING',
    paidAt: transaction.createdAt,
  };
}

/**
 * A verified one-month purchase (Flutterwave, Paystack or PayPal): adds one
 * month of Aila Pro after the account's current paid access. Exactly one
 * delivery claims the payment, and the account row is locked while the
 * period is computed, so concurrent purchases stack instead of overlapping.
 */
async function applyOneTimePayment(
  payment: PaymentRow,
  charge: VerifiedCharge,
  requestId?: string,
): Promise<ApplyResult> {
  if (payment.status === 'SUCCEEDED' && payment.providerTransactionId !== charge.providerTransactionId) {
    // A second charge on a checkout already paid: never a second month
    // silently; the owner refunds it from the provider's dashboard.
    return recordMismatch(payment.accountId, charge.providerTransactionId, 'DUPLICATE_CHARGE_REFUND_REQUIRED', requestId);
  }

  const check = checkVerifiedCharge(charge, {
    txRef: payment.txRef,
    amount: payment.amount.toFixed(2),
    currency: payment.currency,
  });

  if (check.outcome === 'MISMATCH') {
    return recordMismatch(
      payment.accountId,
      charge.providerTransactionId,
      `MISMATCH_${check.reason}`,
      requestId,
      mismatchDetail(check),
    );
  }

  if (check.outcome === 'PENDING') {
    return { outcome: 'PENDING', accountId: payment.accountId };
  }

  const db = getDb();

  if (check.outcome === 'FAILED') {
    // A later successful attempt on the same checkout still counts.
    await db.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    return { outcome: 'FAILED', accountId: payment.accountId };
  }

  const now = new Date();
  const paidAt = charge.paidAt.getTime() > now.getTime() ? now : charge.paidAt;

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${payment.accountId} FOR UPDATE`;

    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCEEDED', providerTransactionId: charge.providerTransactionId, paidAt },
    });

    if (claimed.count === 0) {
      return { kind: 'ALREADY_APPLIED' as const };
    }

    const period = oneMonthAccess(await accessRows(payment.accountId, tx), paidAt);
    let subscriptionId: string;

    if (period.extendId) {
      await tx.subscription.update({
        where: { id: period.extendId },
        data: { currentPeriodEnd: period.end },
      });
      subscriptionId = period.extendId;
    } else {
      const created = await tx.subscription.create({
        data: {
          accountId: payment.accountId,
          provider: charge.provider,
          plan: PLAN,
          status: 'ACTIVE',
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          // Never renews on its own; renewed by buying another month.
          cancelAtPeriodEnd: true,
        },
        select: { id: true },
      });
      subscriptionId = created.id;
    }

    await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId } });
    await tx.trial.updateMany({
      where: { accountId: payment.accountId, status: 'ACTIVE' },
      data: { status: 'CONVERTED', endedAt: now },
    });
    await tx.auditLog.create({
      data: auditLogData({
        action: 'SUBSCRIPTION_CHANGE',
        result: 'SUCCESS',
        accountId: payment.accountId,
        userId: payment.userId,
        resourceType: 'SUBSCRIPTION',
        resourceId: subscriptionId,
        requestId,
        metadata: {
          event: period.extendId ? 'ACCESS_EXTENDED' : 'ACCESS_PURCHASED',
          provider: charge.provider,
          paymentId: payment.id,
          until: period.end.toISOString(),
        },
      }),
    });

    return { kind: 'APPLIED' as const, subscriptionId };
  });

  return {
    outcome: 'ACTIVE',
    accountId: payment.accountId,
    subscriptionId: result.kind === 'APPLIED' ? result.subscriptionId : undefined,
  };
}

/**
 * Applies one Flutterwave transaction, re-read from Flutterwave's verify
 * endpoint (never from the webhook body or the redirect URL).
 */
async function applyTransaction(
  transaction: FlutterwaveTransaction,
  requestId?: string,
): Promise<ApplyResult> {
  const payment = await getDb().payment.findFirst({
    where: { provider: PROVIDER, txRef: transaction.txRef, checkoutExpiresAt: { not: null } },
    select: PAYMENT_SELECT,
  });

  if (payment?.oneTime) {
    return applyOneTimePayment(payment, flutterwaveCharge(transaction), requestId);
  }

  // A paid checkout's reference can come back on a later charge; that charge
  // is a renewal, not the checkout payment again.
  if (
    payment &&
    (payment.status !== 'SUCCEEDED' || payment.providerTransactionId === String(transaction.id))
  ) {
    return applyCheckoutPayment(payment, transaction, requestId);
  }

  return applyRenewalCharge(transaction, requestId);
}

/** The return-URL parameters each provider sends the customer back with. */
export type CheckoutReturn =
  | { readonly provider: 'FLUTTERWAVE'; readonly transactionId: number }
  | { readonly provider: 'PAYSTACK'; readonly reference: string }
  | { readonly provider: 'PAYPAL'; readonly orderId: string };

type ConfirmOutcome = { readonly outcome: 'ACTIVE' | 'PENDING' | 'FAILED' };

function toConfirmOutcome(result: ApplyResult): ConfirmOutcome {
  return result.outcome === 'ACTIVE' || result.outcome === 'PENDING' || result.outcome === 'FAILED'
    ? { outcome: result.outcome }
    : { outcome: 'FAILED' };
}

function isNotFound(error: unknown): boolean {
  return (
    (error instanceof FlutterwaveError || error instanceof PaymentProviderError) &&
    error.kind === 'REJECTED' &&
    error.status !== null &&
    error.status < 500
  );
}

/**
 * Called when the provider sends the customer back to /billing. The value
 * in the URL is only a lookup key: the payment must belong to the
 * signed-in account's checkout and is verified with the provider (PayPal
 * orders are captured here, on the server).
 */
export async function confirmCheckout(
  ctx: AccountContext,
  input: CheckoutReturn,
  requestId?: string,
): Promise<ConfirmOutcome> {
  await requireBillingRateLimit(ctx);

  if (input.provider === 'FLUTTERWAVE') {
    return confirmFlutterwave(ctx, input.transactionId, requestId);
  }

  const payment = await getDb().payment.findFirst({
    where: {
      ...accountScope(ctx),
      provider: input.provider,
      oneTime: true,
      checkoutExpiresAt: { not: null },
      ...(input.provider === 'PAYSTACK'
        ? { txRef: input.reference }
        : { providerTransactionId: input.orderId }),
    },
    select: PAYMENT_SELECT,
  });

  if (!payment) {
    throw new AppError('NOT_FOUND');
  }

  let charge: VerifiedCharge;

  try {
    charge =
      input.provider === 'PAYSTACK'
        ? await verifyPaystackTransaction(input.reference)
        : await capturePaypalOrder(input.orderId);
  } catch (error) {
    if (isNotFound(error)) {
      throw new AppError('NOT_FOUND');
    }

    throw dependencyFailure('verify payment', error, requestId);
  }

  try {
    return toConfirmOutcome(await applyOneTimePayment(payment, charge, requestId));
  } catch (error) {
    throw dependencyFailure('confirm checkout', error, requestId);
  }
}

async function confirmFlutterwave(
  ctx: AccountContext,
  transactionId: number,
  requestId?: string,
): Promise<ConfirmOutcome> {
  let transaction: FlutterwaveTransaction;

  try {
    transaction = await verifyTransaction(transactionId);
  } catch (error) {
    if (error instanceof FlutterwaveError && error.kind === 'REJECTED' && error.status !== null) {
      throw new AppError('NOT_FOUND');
    }

    throw dependencyFailure('verify transaction', error, requestId);
  }

  const payment = await getDb().payment.findFirst({
    where: {
      ...accountScope(ctx),
      provider: PROVIDER,
      txRef: transaction.txRef,
      checkoutExpiresAt: { not: null },
    },
    select: { id: true },
  });

  if (!payment) {
    throw new AppError('NOT_FOUND');
  }

  try {
    return toConfirmOutcome(await applyTransaction(transaction, requestId));
  } catch (error) {
    if (error instanceof BillingRetryLater) {
      return { outcome: 'PENDING' };
    }

    throw dependencyFailure('confirm checkout', error, requestId);
  }
}

// ------------------------------------------------------------------
// Cancellation
// ------------------------------------------------------------------

/** Writes a cancellation if it changes anything. Safe to repeat (AC-163). */
async function recordCancellation(
  subscription: SubscriptionRow,
  by: 'CUSTOMER' | 'PROVIDER',
  context: { readonly userId?: string; readonly requestId?: string },
): Promise<void> {
  const now = new Date();
  const update = cancellationUpdate(subscription, now);

  if (!update) {
    return;
  }

  await getDb().$transaction(async (tx) => {
    const { count } = await tx.subscription.updateMany({
      where: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      data: { ...update, canceledAt: subscription.canceledAt ?? now },
    });

    if (count === 1) {
      await tx.auditLog.create({
        data: auditLogData({
          action: 'SUBSCRIPTION_CHANGE',
          result: 'SUCCESS',
          accountId: subscription.accountId,
          userId: context.userId ?? null,
          resourceType: 'SUBSCRIPTION',
          resourceId: subscription.id,
          requestId: context.requestId,
          metadata: {
            event: 'SUBSCRIPTION_CANCELLED',
            by,
            from: subscription.status,
            to: update.status,
            cancelAtPeriodEnd: update.cancelAtPeriodEnd,
          },
        }),
      });
    }
  });
}

/**
 * Cancels Aila Pro: Flutterwave stops future charges, and access continues
 * until the end of the period already paid for.
 */
export async function cancelSubscription(
  ctx: AccountContext,
  requestId?: string,
): Promise<void> {
  authorize(isAccountOwner(ctx));
  await requireBillingRateLimit(ctx);

  const subscription = await latestSubscription(ctx.account.id);

  if (!subscription || !canCancel(subscription, new Date())) {
    throw new AppError('CONFLICT', {
      reason: 'NO_RENEWING_SUBSCRIPTION',
      message: 'There is no renewing Aila Pro subscription to cancel.',
    });
  }

  if (!subscription.providerSubscriptionId) {
    throw dependencyFailure('cancel subscription', new Error('MissingProviderSubscriptionId'), requestId);
  }

  try {
    await cancelProviderSubscription(subscription.providerSubscriptionId);
  } catch (error) {
    // Flutterwave refuses to cancel a subscription that is already
    // cancelled; confirm that before recording it.
    if (!(error instanceof FlutterwaveError && error.kind === 'REJECTED')) {
      throw dependencyFailure('cancel subscription', error, requestId);
    }

    const firstCharge = await getDb().payment.findFirst({
      where: { ...accountScope(ctx), subscriptionId: subscription.id, status: 'SUCCEEDED' },
      orderBy: { paidAt: 'asc' },
      select: { providerTransactionId: true },
    });

    try {
      const matches = firstCharge?.providerTransactionId
        ? await findSubscriptions({
            planId: getProPlanId(),
            transactionId: Number(firstCharge.providerTransactionId),
          })
        : [];
      const cancelled = matches.some(
        (item) => item.id === subscription.providerSubscriptionId && item.status === 'cancelled',
      );

      if (!cancelled) {
        throw error;
      }
    } catch (lookupError) {
      throw dependencyFailure('cancel subscription', lookupError, requestId);
    }
  }

  await recordCancellation(subscription, 'CUSTOMER', { userId: ctx.user.id, requestId });
}

// ------------------------------------------------------------------
// Webhook events
// ------------------------------------------------------------------

/** charge.completed: verify by ID with Flutterwave, then apply. */
export async function processChargeEvent(
  transactionId: number,
  requestId?: string,
): Promise<ApplyResult> {
  let transaction: FlutterwaveTransaction;

  try {
    transaction = await verifyTransaction(transactionId);
  } catch (error) {
    if (error instanceof FlutterwaveError && error.kind === 'REJECTED' && error.status !== null) {
      // Flutterwave does not know this transaction: a forged or foreign event.
      return recordMismatch(null, transactionId, 'TRANSACTION_NOT_FOUND', requestId);
    }

    throw error;
  }

  return applyTransaction(transaction, requestId);
}

/**
 * subscription.cancelled: matched through Flutterwave's cancelled
 * subscriptions for the customer on the Aila Pro plan.
 */
export async function processSubscriptionCancelledEvent(
  email: string,
  planId: number,
  requestId?: string,
): Promise<ApplyResult> {
  const configuredPlanId = getProPlanId();

  if (planId !== configuredPlanId) {
    return { outcome: 'IGNORED', errorCode: 'OTHER_PLAN' };
  }

  const cancelled = await findSubscriptions({ planId, email, status: 'cancelled' });
  const ids = cancelled.filter((item) => item.status === 'cancelled').map((item) => item.id);
  const subscriptions = ids.length
    ? await getDb().subscription.findMany({
        where: {
          provider: PROVIDER,
          plan: PLAN,
          providerSubscriptionId: { in: ids },
          status: { in: ['ACTIVE', 'PAST_DUE'] },
        },
        select: SUBSCRIPTION_SELECT,
      })
    : [];

  if (subscriptions.length === 0) {
    return { outcome: 'IGNORED', errorCode: 'UNKNOWN_SUBSCRIPTION' };
  }

  for (const subscription of subscriptions) {
    await recordCancellation(subscription, 'PROVIDER', { requestId });
  }

  const [first] = subscriptions;
  return { outcome: 'CANCELLED', accountId: first.accountId, subscriptionId: first.id };
}

/**
 * Paystack charge.success: the reference is only a lookup key; the
 * transaction is re-read from Paystack's verify endpoint before it counts.
 */
export async function processPaystackCharge(reference: string, requestId?: string): Promise<ApplyResult> {
  const payment = await getDb().payment.findFirst({
    where: { provider: 'PAYSTACK', txRef: reference, oneTime: true, checkoutExpiresAt: { not: null } },
    select: PAYMENT_SELECT,
  });

  if (!payment) {
    // Not an Aila Pro checkout (another payment on the same Paystack account).
    return { outcome: 'IGNORED', errorCode: 'UNKNOWN_REFERENCE' };
  }

  let charge: VerifiedCharge;

  try {
    charge = await verifyPaystackTransaction(reference);
  } catch (error) {
    if (isNotFound(error)) {
      return recordMismatch(payment.accountId, reference, 'TRANSACTION_NOT_FOUND', requestId);
    }

    throw error;
  }

  return applyOneTimePayment(payment, charge, requestId);
}

/**
 * PayPal order events: the order is read back from PayPal (and captured if
 * the customer approved it but never returned to Aila) before it counts.
 */
export async function processPaypalOrder(orderId: string, requestId?: string): Promise<ApplyResult> {
  const payment = await getDb().payment.findFirst({
    where: { provider: 'PAYPAL', providerTransactionId: orderId, oneTime: true },
    select: PAYMENT_SELECT,
  });

  if (!payment) {
    return { outcome: 'IGNORED', errorCode: 'UNKNOWN_ORDER' };
  }

  let charge: VerifiedCharge;

  try {
    charge = await capturePaypalOrder(orderId);
  } catch (error) {
    if (isNotFound(error)) {
      return recordMismatch(payment.accountId, orderId, 'ORDER_NOT_FOUND', requestId);
    }

    throw error;
  }

  return applyOneTimePayment(payment, charge, requestId);
}
