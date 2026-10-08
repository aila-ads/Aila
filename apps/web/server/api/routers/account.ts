import {
  changePassword,
  getAccountOverview,
  getPasswordStatus,
  listSessions,
  revokeSession,
  updateProfile,
  updateSettings,
} from '@aila/auth/server';
import {
  changePasswordSchema,
  revokeSessionSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '@aila/validation';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/** Account self-service for the signed-in user (AILA-V1-SCOPE §5). */
export const accountRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => getAccountOverview(ctx.auth)),

  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(({ ctx, input }) => updateProfile(ctx.auth, input, ctx.requestId)),

  updateSettings: protectedProcedure
    .input(updateSettingsSchema)
    .mutation(({ ctx, input }) => updateSettings(ctx.auth, input, ctx.requestId)),

  sessions: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => listSessions(ctx.auth)),

    revoke: protectedProcedure
      .input(revokeSessionSchema)
      .mutation(({ ctx, input }) => revokeSession(ctx.auth, input, ctx.requestId)),
  }),

  password: createTRPCRouter({
    status: protectedProcedure.query(({ ctx }) => getPasswordStatus(ctx.auth)),

    change: protectedProcedure
      .input(changePasswordSchema)
      .mutation(({ ctx, input }) => changePassword(ctx.auth, input, ctx.requestId)),
  }),
});
