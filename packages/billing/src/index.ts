/**
 * Aila Billing Service (APPLICATION-ARCHITECTURE §17). Server only: it
 * reads the Flutterwave secret key and writes billing state. Product code
 * never imports this; it asks the entitlement service.
 */
export {
  cancelSubscription,
  confirmCheckout,
  getBillingSummary,
  startCheckout,
  type BillingPrice,
  type BillingSummary,
} from './service';
export { handleFlutterwaveWebhook } from './handler';
export type { SubscriptionState } from './state';
