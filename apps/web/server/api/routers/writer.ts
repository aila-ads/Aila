import {
  createWriterExportSchema,
  createWriterNodeSchema,
  createWriterProjectSchema,
  createWriterResearchSchema,
  createWriterVersionSchema,
  moveWriterNodeSchema,
  restoreWriterVersionSchema,
  saveWriterContentSchema,
  updateWriterNodeSchema,
  updateWriterProjectSchema,
  updateWriterResearchSchema,
  writerExportIdSchema,
  writerNodeIdSchema,
  writerProjectIdSchema,
  writerProjectStatusSchema,
  writerReferenceSchema,
  writerResearchIdSchema,
  writerSearchSchema,
  writerVersionIdSchema,
} from '@aila/validation';
import { createExport, deleteExport, downloadExport, listExports } from '../../writer/export/service';
import {
  createNode,
  duplicateNode,
  getNode,
  listTrash,
  moveNode,
  purgeNode,
  restoreNode,
  saveContent,
  trashNode,
  updateNode,
} from '../../writer/nodes';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  setProjectArchived,
  updateProject,
} from '../../writer/projects';
import { attachReference, detachReference, listReferences } from '../../writer/references';
import { createResearch, deleteResearch, listResearch, updateResearch } from '../../writer/research';
import { search } from '../../writer/search';
import { createVersion, getVersion, listVersions, restoreVersion } from '../../writer/versions';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Aila Writer (docs/products/WRITER.md). Every procedure is authenticated
 * and passes the session's account to the service, which scopes every
 * query to it. AI suggestions stream from /api/writer/assist. Reading stays
 * available after the trial; writing, AI and exports need the `writer`
 * entitlement, checked in the services.
 */
export const writerRouter = createTRPCRouter({
  projects: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => listProjects(ctx.auth)),
    get: protectedProcedure
      .input(writerProjectIdSchema)
      .query(({ ctx, input }) => getProject(ctx.auth, input.projectId)),
    create: protectedProcedure
      .input(createWriterProjectSchema)
      .mutation(({ ctx, input }) => createProject(ctx.auth, input, ctx.requestId)),
    update: protectedProcedure
      .input(updateWriterProjectSchema)
      .mutation(({ ctx, input }) => updateProject(ctx.auth, input, ctx.requestId)),
    setArchived: protectedProcedure
      .input(writerProjectStatusSchema)
      .mutation(({ ctx, input }) => setProjectArchived(ctx.auth, input, ctx.requestId)),
    delete: protectedProcedure
      .input(writerProjectIdSchema)
      .mutation(({ ctx, input }) => deleteProject(ctx.auth, input.projectId, ctx.requestId)),
  }),

  nodes: createTRPCRouter({
    get: protectedProcedure.input(writerNodeIdSchema).query(({ ctx, input }) => getNode(ctx.auth, input.nodeId)),
    create: protectedProcedure
      .input(createWriterNodeSchema)
      .mutation(({ ctx, input }) => createNode(ctx.auth, input, ctx.requestId)),
    update: protectedProcedure
      .input(updateWriterNodeSchema)
      .mutation(({ ctx, input }) => updateNode(ctx.auth, input, ctx.requestId)),
    save: protectedProcedure
      .input(saveWriterContentSchema)
      .mutation(({ ctx, input }) => saveContent(ctx.auth, input, ctx.requestId)),
    move: protectedProcedure
      .input(moveWriterNodeSchema)
      .mutation(({ ctx, input }) => moveNode(ctx.auth, input, ctx.requestId)),
    duplicate: protectedProcedure
      .input(writerNodeIdSchema)
      .mutation(({ ctx, input }) => duplicateNode(ctx.auth, input.nodeId, ctx.requestId)),
    trash: protectedProcedure
      .input(writerNodeIdSchema)
      .mutation(({ ctx, input }) => trashNode(ctx.auth, input.nodeId, ctx.requestId)),
    listTrash: protectedProcedure
      .input(writerProjectIdSchema)
      .query(({ ctx, input }) => listTrash(ctx.auth, input.projectId)),
    restore: protectedProcedure
      .input(writerNodeIdSchema)
      .mutation(({ ctx, input }) => restoreNode(ctx.auth, input.nodeId, ctx.requestId)),
    purge: protectedProcedure
      .input(writerNodeIdSchema)
      .mutation(({ ctx, input }) => purgeNode(ctx.auth, input.nodeId, ctx.requestId)),
  }),

  versions: createTRPCRouter({
    list: protectedProcedure.input(writerNodeIdSchema).query(({ ctx, input }) => listVersions(ctx.auth, input.nodeId)),
    get: protectedProcedure.input(writerVersionIdSchema).query(({ ctx, input }) => getVersion(ctx.auth, input.versionId)),
    create: protectedProcedure
      .input(createWriterVersionSchema)
      .mutation(({ ctx, input }) => createVersion(ctx.auth, input, ctx.requestId)),
    restore: protectedProcedure
      .input(restoreWriterVersionSchema)
      .mutation(({ ctx, input }) => restoreVersion(ctx.auth, input, ctx.requestId)),
  }),

  research: createTRPCRouter({
    list: protectedProcedure
      .input(writerProjectIdSchema)
      .query(({ ctx, input }) => listResearch(ctx.auth, input.projectId)),
    create: protectedProcedure
      .input(createWriterResearchSchema)
      .mutation(({ ctx, input }) => createResearch(ctx.auth, input, ctx.requestId)),
    update: protectedProcedure
      .input(updateWriterResearchSchema)
      .mutation(({ ctx, input }) => updateResearch(ctx.auth, input, ctx.requestId)),
    delete: protectedProcedure
      .input(writerResearchIdSchema)
      .mutation(({ ctx, input }) => deleteResearch(ctx.auth, input.researchId)),
  }),

  references: createTRPCRouter({
    list: protectedProcedure
      .input(writerProjectIdSchema)
      .query(({ ctx, input }) => listReferences(ctx.auth, input.projectId)),
    attach: protectedProcedure
      .input(writerReferenceSchema)
      .mutation(({ ctx, input }) => attachReference(ctx.auth, input, ctx.requestId)),
    detach: protectedProcedure
      .input(writerReferenceSchema)
      .mutation(({ ctx, input }) => detachReference(ctx.auth, input, ctx.requestId)),
  }),

  search: protectedProcedure.input(writerSearchSchema).query(({ ctx, input }) => search(ctx.auth, input)),

  exports: createTRPCRouter({
    list: protectedProcedure
      .input(writerProjectIdSchema)
      .query(({ ctx, input }) => listExports(ctx.auth, input.projectId)),
    create: protectedProcedure
      .input(createWriterExportSchema)
      .mutation(({ ctx, input }) => createExport(ctx.auth, input, ctx.requestId)),
    // A mutation: each call creates a signed link and an audit record.
    download: protectedProcedure
      .input(writerExportIdSchema)
      .mutation(({ ctx, input }) => downloadExport(ctx.auth, input.exportId, ctx.requestId)),
    delete: protectedProcedure
      .input(writerExportIdSchema)
      .mutation(({ ctx, input }) => deleteExport(ctx.auth, input.exportId, ctx.requestId)),
  }),
});

