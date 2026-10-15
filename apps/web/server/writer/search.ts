import { accountScope, type AccountContext } from '@aila/auth/server';
import { getDb } from '@aila/db';
import type { WriterNodeKind, WriterSearchInput } from '@aila/validation';
import { projectProblem } from './projects';
import { visibleProject } from './shared';

/**
 * Project and chapter search (docs/products/WRITER.md §28). Covers project
 * titles and descriptions, document, part, chapter and section titles,
 * synopses and content, and research notes; always within the signed-in
 * account, never in deleted projects or the trash.
 */

const RESULT_LIMIT = 30;
const SNIPPET_RADIUS = 80;

export type SearchResult =
  | {
      readonly type: 'project';
      readonly projectId: string;
      readonly projectTitle: string;
      readonly snippet: string | null;
    }
  | {
      readonly type: 'node';
      readonly projectId: string;
      readonly projectTitle: string;
      readonly nodeId: string;
      readonly kind: WriterNodeKind;
      readonly title: string;
      readonly snippet: string | null;
    }
  | {
      readonly type: 'research';
      readonly projectId: string;
      readonly projectTitle: string;
      readonly researchId: string;
      readonly title: string;
      readonly snippet: string | null;
    };

/** A short excerpt around the first match, on word boundaries, or null when there is no match. */
export function snippetAround(text: string | null, query: string): string | null {
  if (!text) {
    return null;
  }

  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());

  if (index < 0) {
    return null;
  }

  let start = Math.max(0, index - SNIPPET_RADIUS);
  let end = Math.min(text.length, index + query.length + SNIPPET_RADIUS);

  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space >= 0 && space < index ? space + 1 : start;
  }

  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    end = space > index + query.length ? space : end;
  }

  const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`;
}

export async function search(ctx: AccountContext, input: WriterSearchInput): Promise<SearchResult[]> {
  const db = getDb();
  const query = input.query;
  const contains = { contains: query, mode: 'insensitive' as const };
  const liveProject = { status: { in: ['ACTIVE', 'ARCHIVED'] as ('ACTIVE' | 'ARCHIVED')[] }, deletedAt: null };

  if (input.projectId && (await db.writerProject.count({ where: visibleProject(ctx, input.projectId) })) === 0) {
    throw await projectProblem(ctx, input.projectId);
  }

  const inProject = input.projectId ? { projectId: input.projectId } : {};

  const [projects, nodes, research] = await Promise.all([
    input.projectId
      ? Promise.resolve([])
      : db.writerProject.findMany({
          where: { ...accountScope(ctx), ...liveProject, OR: [{ title: contains }, { subtitle: contains }, { description: contains }] },
          select: { id: true, title: true, subtitle: true, description: true },
          orderBy: { updatedAt: 'desc' },
          take: RESULT_LIMIT,
        }),
    db.writerNode.findMany({
      where: {
        ...accountScope(ctx),
        ...inProject,
        deletedAt: null,
        project: liveProject,
        OR: [{ title: contains }, { summary: contains }, { content: contains }],
      },
      select: {
        id: true,
        projectId: true,
        kind: true,
        title: true,
        summary: true,
        content: true,
        project: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: RESULT_LIMIT,
    }),
    db.writerResearchItem.findMany({
      where: {
        ...accountScope(ctx),
        ...inProject,
        project: liveProject,
        OR: [{ title: contains }, { body: contains }, { sourceTitle: contains }],
      },
      select: { id: true, projectId: true, title: true, body: true, project: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: RESULT_LIMIT,
    }),
  ]);

  return [
    ...projects.map((project): SearchResult => ({
      type: 'project',
      projectId: project.id,
      projectTitle: project.title,
      snippet: snippetAround(project.subtitle, query) ?? snippetAround(project.description, query),
    })),
    ...nodes.map((node): SearchResult => ({
      type: 'node',
      projectId: node.projectId,
      projectTitle: node.project.title,
      nodeId: node.id,
      kind: node.kind,
      title: node.title,
      snippet: snippetAround(node.content, query) ?? snippetAround(node.summary, query),
    })),
    ...research.map((item): SearchResult => ({
      type: 'research',
      projectId: item.projectId,
      projectTitle: item.project.title,
      researchId: item.id,
      title: item.title,
      snippet: snippetAround(item.body, query),
    })),
  ];
}
