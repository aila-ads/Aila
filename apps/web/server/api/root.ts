import { accountRouter } from './routers/account';
import { filesRouter } from './routers/files';
import { createCallerFactory, createTRPCRouter } from './trpc';

export const appRouter = createTRPCRouter({
  account: accountRouter,
  files: filesRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
