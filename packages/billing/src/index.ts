/**
 * Aila Billing Service (APPLICATION-ARCHITECTURE §17). Server only: it
 * reads the Flutterwave, Paystack and PayPal secrets and writes billing state. Product code
 * never imports this; it asks the entitlement service.
 */
export {
  cancelSubscription,
  confirmCheckout,
  getBillingSummary,
  startCheckout,
  type BillingPrice,
  type BillingSummary,
  type CheckoutMethod,
  type CheckoutOption,
  type CheckoutReturn,
} from './service';
export { handleFlutterwaveWebhook, handlePaypalWebhook, handlePaystackWebhook } from './handler';
export type { SubscriptionState } from './state';
