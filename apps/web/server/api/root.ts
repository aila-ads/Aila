import { accountRouter } from './routers/account';
import { billingRouter } from './routers/billing';
import { filesRouter } from './routers/files';
import { intelligenceRouter } from './routers/intelligence';
import { createCallerFactory, createTRPCRouter } from './trpc';

export const appRouter = createTRPCRouter({
  account: accountRouter,
  billing: billingRouter,
  files: filesRouter,
  intelligence: intelligenceRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
