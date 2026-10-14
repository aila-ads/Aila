import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb } from '@aila/db';
import { deleteGeneratedFiles } from '@aila/storage';
import {
  AppError,
  WRITER_MAX_PROJECTS,
  type CreateWriterProjectInput,
  type UpdateWriterProjectInput,
  type WriterDocumentType,
  type WriterNodeKind,
  type WriterNodeStatus,
} from '@aila/validation';
import {
  RESOURCE,
  archivedError,
  editableProject,
  logWriterError,
  projectNotFound,
  requireWriter,
  visibleProject,
  writerAudit,
} from './shared';
import { projectStats, publishingChecklist, readingOrder, type ChecklistItem, type WriterStats } from './structure';

/**
 * Writer projects (docs/products/WRITER.md §7, §29-30, §34, §51). A project
 * belongs to exactly one account; it can be archived (read-only, still
 * available) and deleted, which removes its writing, versions, research,
 * references and exports.
 */

export type ProjectSummary = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly documentType: WriterDocumentType;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly words: number;
  readonly updatedAt: string;
};

/** The account's projects, most recently changed first. Deleted projects never appear. */
export async function listProjects(ctx: AccountContext): Promise<ProjectSummary[]> {
  const db = getDb();
  const projects = await db.writerProject.findMany({
    where: { ...accountScope(ctx), status: { in: ['ACTIVE', 'ARCHIVED'] }, deletedAt: null },
    select: { id: true, title: true, subtitle: true, documentType: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: WRITER_MAX_PROJECTS,
  });

  if (projects.length === 0) {
    return [];
  }

  const words = await db.writerNode.groupBy({
    by: ['projectId'],
    where: { ...accountScope(ctx), projectId: { in: projects.map((project) => project.id) }, deletedAt: null },
    _sum: { wordCount: true },
  });
  const wordsByProject = new Map(words.map((row) => [row.projectId, row._sum.wordCount ?? 0]));

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    subtitle: project.subtitle,
    documentType: project.documentType,
    status: project.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    words: wordsByProject.get(project.id) ?? 0,
    updatedAt: project.updatedAt.toISOString(),
  }));
}

export type OutlineNode = {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: WriterNodeKind;
  readonly title: string;
  readonly summary: string | null;
  readonly position: number;
  readonly status: WriterNodeStatus;
  readonly wordCount: number;
  readonly charCount: number;
  readonly depth: number;
  readonly updatedAt: string;
};

export type ProjectDetail = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly documentType: WriterDocumentType;
  readonly language: string;
  readonly audience: string | null;
  readonly authorName: string | null;
  readonly goals: string | null;
  readonly styleInstructions: string | null;
  readonly terminology: string | null;
  readonly contextNotes: string | null;
  readonly wordGoal: number | null;
  readonly chapterGoal: number | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  /** The hierarchy in reading order, without content (WRITER §53: no full reload per edit). */
  readonly outline: readonly OutlineNode[];
  readonly stats: WriterStats;
  readonly checklist: readonly ChecklistItem[];
};

/** One project with its outline, statistics and publishing checks. */
export async function getProject(ctx: AccountContext, projectId: string): Promise<ProjectDetail> {
  const db = getDb();
  const project = await db.writerProject.findFirst({
    where: visibleProject(ctx, projectId),
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      documentType: true,
      language: true,
      audience: true,
      authorName: true,
      goals: true,
      styleInstructions: true,
      terminology: true,
      contextNotes: true,
      wordGoal: true,
      chapterGoal: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
    },
  });

  if (!project) {
    throw projectNotFound();
  }

  const nodes = await db.writerNode.findMany({
    where: { ...accountScope(ctx), projectId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      kind: true,
      title: true,
      summary: true,
      position: true,
      status: true,
      wordCount: true,
      charCount: true,
      updatedAt: true,
    },
  });
  const outline = readingOrder(nodes).map((node) => ({ ...node, updatedAt: node.updatedAt.toISOString() }));

  return {
    ...project,
    status: project.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
    outline,
    stats: projectStats(outline, project),
    checklist: publishingChecklist(project, outline),
  };
}

/** Creates a project (AC-070). */
export async function createProject(
  ctx: AccountContext,
  input: CreateWriterProjectInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  return db.$transaction(async (tx) => {
    const count = await tx.writerProject.count({
      where: { ...accountScope(ctx), status: { in: ['ACTIVE', 'ARCHIVED'] }, deletedAt: null },
    });

    if (count >= WRITER_MAX_PROJECTS) {
      throw new AppError('VALIDATION_ERROR', {
        message: `You can have up to ${WRITER_MAX_PROJECTS} Writer projects. Delete one you no longer need.`,
      });
    }

    const project = await tx.writerProject.create({
      data: {
        accountId: ctx.account.id,
        createdById: ctx.user.id,
        title: input.title,
        documentType: input.documentType,
        language: input.language,
        description: input.description ?? null,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: writerAudit(ctx, { action: 'CREATE', resourceType: RESOURCE.project, resourceId: project.id, requestId }),
    });

    return { id: project.id };
  });
}

/** Changes project details and context (WRITER §7.1, §22, §30). Only the fields given change. */
export async function updateProject(
  ctx: AccountContext,
  input: UpdateWriterProjectInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const { projectId, ...changes } = input;
  const data = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));

  if (Object.keys(data).length === 0) {
    return { id: projectId };
  }

  const db = getDb();
  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.writerProject.updateMany({ where: editableProject(ctx, projectId), data });

    if (count === 0) {
      return false;
    }

    // Field names only: the values are the author's content.
    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'UPDATE',
        resourceType: RESOURCE.project,
        resourceId: projectId,
        requestId,
        metadata: { fields: Object.keys(data).sort() },
      }),
    });
    return true;
  });

  if (!updated) {
    throw await projectProblem(ctx, projectId);
  }

  return { id: projectId };
}

/** Why a project cannot be changed: archived, or not found. */
export async function projectProblem(ctx: AccountContext, projectId: string): Promise<AppError> {
  const archived = await getDb().writerProject.count({
    where: { id: projectId, ...accountScope(ctx), status: 'ARCHIVED', deletedAt: null },
  });
  return archived > 0 ? archivedError() : projectNotFound();
}

/**
 * Archives or restores a project (WRITER §7.2). Archived projects stay
 * readable and exportable; they are read-only until restored. No
 * entitlement is needed: this only organises the account's own work.
 */
export async function setProjectArchived(
  ctx: AccountContext,
  input: { readonly projectId: string; readonly archived: boolean },
  requestId: string,
): Promise<{ readonly id: string; readonly status: 'ACTIVE' | 'ARCHIVED' }> {
  const db = getDb();
  const from = input.archived ? 'ACTIVE' : 'ARCHIVED';
  const to = input.archived ? 'ARCHIVED' : 'ACTIVE';
  const changed = await db.$transaction(async (tx) => {
    const { count } = await tx.writerProject.updateMany({
      where: { id: input.projectId, ...accountScope(ctx), status: from, deletedAt: null },
      data: { status: to, archivedAt: input.archived ? new Date() : null },
    });

    if (count === 0) {
      return false;
    }

    await tx.auditLog.create({
      data: writerAudit(ctx, {
        action: 'UPDATE',
        resourceType: RESOURCE.project,
        resourceId: input.projectId,
        requestId,
        metadata: { status: to },
      }),
    });
    return true;
  });

  if (!changed) {
    const exists = await db.writerProject.count({ where: visibleProject(ctx, input.projectId) });

    if (exists === 0) {
      throw projectNotFound();
    }
  }

  return { id: input.projectId, status: to };
}

/**
 * Deletes a project (WRITER §51). In one transaction the project is marked
 * deleted, its details are cleared and every dependent record (writing,
 * versions, research, reference links, export records) is removed. Exported
 * files are then deleted from storage; a failed removal is retried by the
 * storage cleanup. The account's own uploaded files stay in Files.
 */
export async function deleteProject(
  ctx: AccountContext,
  projectId: string,
  requestId: string,
): Promise<{ readonly id: string }> {
  const db = getDb();
  const exportFileIds = await db.$transaction(async (tx) => {
    const { count } = await tx.writerProject.updateMany({
      where: visibleProject(ctx, projectId),
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        title: 'Deleted project',
        subtitle: null,
        description: null,
        audience: null,
        authorName: null,
        goals: null,
        styleInstructions: null,
        terminology: null,
        contextNotes: null,
      },
    });

    if (count === 0) {
      return null;
    }

    const exports = await tx.writerExport.findMany({
      where: { ...accountScope(ctx), projectId, fileId: { not: null } },
      select: { fileId: true },
    });

    await tx.writerExport.deleteMany({ where: { ...accountScope(ctx), projectId } });
    await tx.writerVersion.deleteMany({ where: { ...accountScope(ctx), projectId } });
    await tx.writerNode.deleteMany({ where: { ...accountScope(ctx), projectId } });
    await tx.writerResearchItem.deleteMany({ where: { ...accountScope(ctx), projectId } });
    await tx.writerReference.deleteMany({ where: { ...accountScope(ctx), projectId } });
    await tx.auditLog.create({
      data: writerAudit(ctx, { action: 'DELETE', resourceType: RESOURCE.project, resourceId: projectId, requestId }),
    });

    return exports.flatMap((row) => (row.fileId ? [row.fileId] : []));
  });

  if (exportFileIds === null) {
    throw projectNotFound();
  }

  if (exportFileIds.length > 0) {
    try {
      await deleteGeneratedFiles(ctx, exportFileIds, requestId);
    } catch (error) {
      logWriterError('delete-project-exports', requestId, error);
    }
  }

  return { id: projectId };
}
