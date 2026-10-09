import { conversationIdSchema, renameConversationSchema } from '@aila/validation';
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from '../../intelligence/service';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Aila Intelligence conversations (AILA-V1-SCOPE §7). Sending a message
 * streams, so it has its own route: /api/intelligence/messages. History
 * stays readable after the trial, like the account's other data
 * (PRODUCT-SPEC §5); new AI replies need the `intelligence` entitlement.
 */
export const intelligenceRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listConversations(ctx.auth)),

  get: protectedProcedure
    .input(conversationIdSchema)
    .query(({ ctx, input }) => getConversation(ctx.auth, input.conversationId)),

  rename: protectedProcedure
    .input(renameConversationSchema)
    .mutation(({ ctx, input }) => renameConversation(ctx.auth, input, ctx.requestId)),

  delete: protectedProcedure
    .input(conversationIdSchema)
    .mutation(({ ctx, input }) => deleteConversation(ctx.auth, input.conversationId, ctx.requestId)),
});
