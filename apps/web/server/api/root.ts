import { accountRouter } from './routers/account';
import { billingRouter } from './routers/billing';
import { filesRouter } from './routers/files';
import { createCallerFactory, createTRPCRouter } from './trpc';

export const appRouter = createTRPCRouter({
  account: accountRouter,
  billing: billingRouter,
  files: filesRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
