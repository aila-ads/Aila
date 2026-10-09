import {
  cancelSubscription,
  confirmCheckout,
  getBillingSummary,
  startCheckout,
} from '@aila/billing';
import { confirmCheckoutSchema } from '@aila/validation';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/** Aila Pro billing (AILA-V1-SCOPE §23). All rules live in @aila/billing. */
export const billingRouter = createTRPCRouter({
  summary: protectedProcedure.query(({ ctx }) => getBillingSummary(ctx.auth, ctx.requestId)),

  checkout: protectedProcedure.mutation(({ ctx }) => startCheckout(ctx.auth, ctx.requestId)),

  confirm: protectedProcedure
    .input(confirmCheckoutSchema)
    .mutation(({ ctx, input }) => confirmCheckout(ctx.auth, input.transactionId, ctx.requestId)),

  cancel: protectedProcedure.mutation(({ ctx }) => cancelSubscription(ctx.auth, ctx.requestId)),
});
