import {
  completeUpload,
  createUpload,
  deleteFile,
  getDownloadUrl,
  listFiles,
} from '@aila/storage';
import { createUploadSchema, fileIdSchema } from '@aila/validation';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/** Files (AILA-V1-SCOPE §17). Authorization and storage live in @aila/storage. */
export const filesRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listFiles(ctx.auth)),

  createUpload: protectedProcedure
    .input(createUploadSchema)
    .mutation(({ ctx, input }) => createUpload(ctx.auth, input, ctx.requestId)),

  completeUpload: protectedProcedure
    .input(fileIdSchema)
    .mutation(({ ctx, input }) => completeUpload(ctx.auth, input.fileId, ctx.requestId)),

  // A mutation: each call creates a signed link and an audit record.
  getDownloadUrl: protectedProcedure
    .input(fileIdSchema)
    .mutation(({ ctx, input }) => getDownloadUrl(ctx.auth, input.fileId, ctx.requestId)),

  delete: protectedProcedure
    .input(fileIdSchema)
    .mutation(({ ctx, input }) => deleteFile(ctx.auth, input.fileId, ctx.requestId)),
});
