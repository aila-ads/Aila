import {
  cancelSubscription,
  confirmCheckout,
  getBillingSummary,
  startCheckout,
} from '@aila/billing';
import { confirmCheckoutSchema, startCheckoutSchema } from '@aila/validation';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/** Aila Pro billing (AILA-V1-SCOPE §23). All rules live in @aila/billing. */
export const billingRouter = createTRPCRouter({
  summary: protectedProcedure.query(({ ctx }) => getBillingSummary(ctx.auth, ctx.requestId)),

  checkout: protectedProcedure
    .input(startCheckoutSchema)
    .mutation(({ ctx, input }) => startCheckout(ctx.auth, input.method, ctx.requestId)),

  confirm: protectedProcedure
    .input(confirmCheckoutSchema)
    .mutation(({ ctx, input }) => confirmCheckout(ctx.auth, input, ctx.requestId)),

  cancel: protectedProcedure.mutation(({ ctx }) => cancelSubscription(ctx.auth, ctx.requestId)),
});
