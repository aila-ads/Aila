import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb } from '@aila/db';
import {
  AppError,
  WRITER_MAX_RESEARCH_ITEMS,
  type CreateWriterResearchInput,
  type UpdateWriterResearchInput,
  type WriterResearchKind,
} from '@aila/validation';
import { projectProblem } from './projects';
import { editableProject, requireWriter, visibleProject } from './shared';

/**
 * Research questions, notes and sources (docs/products/WRITER.md §24). A
 * source keeps its web address and title so attribution is preserved;
 * Aila never marks a research item as verified.
 */

export type ResearchItem = {
  readonly id: string;
  readonly kind: WriterResearchKind;
  readonly title: string;
  readonly body: string | null;
  readonly url: string | null;
  readonly sourceTitle: string | null;
  readonly updatedAt: string;
};

const researchNotFound = () => new AppError('NOT_FOUND', { message: 'We could not find that research item.' });

const select = { id: true, kind: true, title: true, body: true, url: true, sourceTitle: true, updatedAt: true } as const;

export async function listResearch(ctx: AccountContext, projectId: string): Promise<ResearchItem[]> {
  const db = getDb();

  if ((await db.writerProject.count({ where: visibleProject(ctx, projectId) })) === 0) {
    throw await projectProblem(ctx, projectId);
  }

  const items = await db.writerResearchItem.findMany({
    where: { ...accountScope(ctx), projectId },
    select,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: WRITER_MAX_RESEARCH_ITEMS,
  });
  return items.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() }));
}

export async function createResearch(
  ctx: AccountContext,
  input: CreateWriterResearchInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const db = getDb();

  const created = await db.$transaction(async (tx) => {
    if ((await tx.writerProject.count({ where: editableProject(ctx, input.projectId) })) === 0) {
      return null;
    }

    if ((await tx.writerResearchItem.count({ where: { ...accountScope(ctx), projectId: input.projectId } })) >= WRITER_MAX_RESEARCH_ITEMS) {
      throw new AppError('VALIDATION_ERROR', {
        message: `A project can have up to ${WRITER_MAX_RESEARCH_ITEMS.toLocaleString('en-US')} research items.`,
      });
    }

    return tx.writerResearchItem.create({
      data: {
        accountId: ctx.account.id,
        projectId: input.projectId,
        createdById: ctx.user.id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
        sourceTitle: input.sourceTitle ?? null,
      },
      select: { id: true },
    });
  });

  if (!created) {
    throw await projectProblem(ctx, input.projectId);
  }

  return created;
}

/** Research items of active projects in the account. */
function editableResearch(ctx: AccountContext, researchId: string) {
  return { id: researchId, ...accountScope(ctx), project: { status: 'ACTIVE' as const, deletedAt: null } };
}

export async function updateResearch(
  ctx: AccountContext,
  input: UpdateWriterResearchInput,
  requestId: string,
): Promise<{ readonly id: string }> {
  await requireWriter(ctx, requestId);
  const { researchId, ...changes } = input;
  const data = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  const { count } = await getDb().writerResearchItem.updateMany({ where: editableResearch(ctx, researchId), data });

  if (count === 0) {
    throw researchNotFound();
  }

  return { id: researchId };
}

/** Deleting needs no entitlement: it only removes the account's own notes. */
export async function deleteResearch(ctx: AccountContext, researchId: string): Promise<{ readonly id: string }> {
  const { count } = await getDb().writerResearchItem.deleteMany({ where: editableResearch(ctx, researchId) });

  if (count === 0) {
    throw researchNotFound();
  }

  return { id: researchId };
}
