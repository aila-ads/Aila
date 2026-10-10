import {
  WRITER_NODE_KIND_LABELS,
  type WriterNodeKind,
  type WriterNodeStatus,
} from '@aila/validation';

/**
 * Pure rules for the Writer hierarchy, statistics and publishing checks
 * (docs/products/WRITER.md §8-9, §29-30, §34). No database access, so the
 * same results come from every caller and are easy to test.
 */

export type TreeNode = {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: WriterNodeKind;
  readonly title: string;
  readonly position: number;
};

/**
 * Deterministic sibling order (WRITER §9): stored position, then ID.
 * Positions can have gaps after a node goes to the trash; order stays stable.
 */
export function compareSiblings(a: TreeNode, b: TreeNode): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Children of each node (null: top level), each list in order. */
export function childrenByParent<T extends TreeNode>(nodes: readonly T[]): Map<string | null, T[]> {
  const ids = new Set(nodes.map((node) => node.id));
  const map = new Map<string | null, T[]>();

  for (const node of nodes) {
    // A node whose parent is not in the list is shown at the top level.
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const list = map.get(key) ?? [];
    list.push(node);
    map.set(key, list);
  }

  for (const list of map.values()) {
    list.sort(compareSiblings);
  }

  return map;
}

export type OrderedNode<T> = T & { readonly depth: number };

/** Nodes in reading order (depth-first, siblings in order), with their depth. */
export function readingOrder<T extends TreeNode>(nodes: readonly T[], rootId: string | null = null): OrderedNode<T>[] {
  const children = childrenByParent(nodes);
  const result: OrderedNode<T>[] = [];
  const seen = new Set<string>();

  const visit = (node: T, depth: number) => {
    if (seen.has(node.id)) {
      return;
    }

    seen.add(node.id);
    result.push({ ...node, depth });

    for (const child of children.get(node.id) ?? []) {
      visit(child, depth + 1);
    }
  };

  if (rootId === null) {
    for (const node of children.get(null) ?? []) {
      visit(node, 0);
    }
  } else {
    const root = nodes.find((node) => node.id === rootId);

    if (root) {
      visit(root, 0);
    }
  }

  return result;
}

/** IDs of a node and everything under it. */
export function subtreeIds(nodes: readonly Pick<TreeNode, 'id' | 'parentId'>[], rootId: string): Set<string> {
  const byParent = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.parentId !== null) {
      byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
    }
  }

  const ids = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;

    for (const child of byParent.get(id) ?? []) {
      if (!ids.has(child)) {
        ids.add(child);
        queue.push(child);
      }
    }
  }

  return ids;
}

/** Positions 0..n-1 for `ids` in the given order, as updates for changed nodes only. */
export function renumber(
  ordered: readonly Pick<TreeNode, 'id' | 'position'>[],
): { readonly id: string; readonly position: number }[] {
  return ordered.flatMap((node, index) => (node.position === index ? [] : [{ id: node.id, position: index }]));
}

/** Inserts `id` at `index` among `siblings` (already in order, without `id`). */
export function insertAt<T extends { readonly id: string }>(siblings: readonly T[], item: T, index: number): T[] {
  const at = Math.max(0, Math.min(index, siblings.length));
  return [...siblings.slice(0, at), item, ...siblings.slice(at)];
}

export type StatsNode = TreeNode & {
  readonly wordCount: number;
  readonly charCount: number;
  readonly status: WriterNodeStatus;
};

export type WriterStats = {
  readonly words: number;
  readonly characters: number;
  readonly documents: number;
  readonly parts: number;
  readonly chapters: number;
  readonly sections: number;
  readonly finalCount: number;
  readonly wordGoal: number | null;
  readonly chapterGoal: number | null;
  /** 0-100, null without a goal. Informational only (WRITER §30). */
  readonly wordGoalPercent: number | null;
  readonly chapterGoalPercent: number | null;
};

const percent = (value: number, goal: number | null) =>
  goal && goal > 0 ? Math.min(100, Math.floor((value / goal) * 100)) : null;

/** Project statistics from stored counts (WRITER §29), calculated the same way everywhere. */
export function projectStats(
  nodes: readonly StatsNode[],
  goals: { readonly wordGoal: number | null; readonly chapterGoal: number | null },
): WriterStats {
  const count = (kind: WriterNodeKind) => nodes.filter((node) => node.kind === kind).length;
  const words = nodes.reduce((total, node) => total + node.wordCount, 0);
  const chapters = count('CHAPTER');

  return {
    words,
    characters: nodes.reduce((total, node) => total + node.charCount, 0),
    documents: count('DOCUMENT'),
    parts: count('PART'),
    chapters,
    sections: count('SECTION'),
    finalCount: nodes.filter((node) => node.status === 'FINAL').length,
    wordGoal: goals.wordGoal,
    chapterGoal: goals.chapterGoal,
    wordGoalPercent: percent(words, goals.wordGoal),
    chapterGoalPercent: percent(chapters, goals.chapterGoal),
  };
}

export type ChecklistItem = {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  /** What to do, when not done. */
  readonly detail: string | null;
};

/**
 * Publishing preparation checks (WRITER §34). These only help the author
 * get ready; nothing is published and passing them does not mean the work
 * is ready for publication.
 */
export function publishingChecklist(
  project: {
    readonly title: string;
    readonly subtitle: string | null;
    readonly description: string | null;
    readonly authorName: string | null;
  },
  nodes: readonly StatsNode[],
): ChecklistItem[] {
  const writingNodes = nodes.filter((node) => node.kind !== 'DOCUMENT' && node.kind !== 'PART');
  const chapters = nodes.filter((node) => node.kind === 'CHAPTER');
  const units = chapters.length > 0 ? chapters : writingNodes;
  // A unit counts as written when it, or anything inside it, has words.
  const wordsWithin = (id: string) => {
    const ids = subtreeIds(nodes, id);
    return nodes.reduce((total, node) => (ids.has(node.id) ? total + node.wordCount : total), 0);
  };
  const empty = units.filter((node) => wordsWithin(node.id) === 0);
  const notFinal = nodes.filter((node) => node.status !== 'FINAL');
  const untitled = nodes.filter((node) => /^(untitled|new (document|part|chapter|section))$/i.test(node.title.trim()));
  const label = (node: StatsNode) => `${WRITER_NODE_KIND_LABELS[node.kind]} “${node.title}”`;
  const names = (list: readonly StatsNode[]) =>
    list.length <= 3 ? list.map(label).join(', ') : `${list.slice(0, 3).map(label).join(', ')} and ${list.length - 3} more`;

  return [
    {
      id: 'title',
      label: 'Title is set',
      done: project.title.trim().length > 0,
      detail: 'Add a title in Project details.',
    },
    {
      id: 'author',
      label: 'Author name is set',
      done: Boolean(project.authorName),
      detail: 'Add the author name in Project details. It appears on the title page of exports.',
    },
    {
      id: 'description',
      label: 'Description is written',
      done: Boolean(project.description),
      detail: 'Add a short description in Project details. It is saved in EPUB metadata.',
    },
    {
      id: 'structure',
      label: 'The work has chapters or sections',
      done: units.length > 0,
      detail: 'Add a chapter from the project outline.',
    },
    {
      id: 'content',
      label: 'Every chapter has writing',
      done: units.length > 0 && empty.length === 0,
      detail: units.length > 0 ? `Still empty: ${names(empty)}.` : 'Write the first chapter.',
    },
    {
      id: 'titles',
      label: 'Every part has its own title',
      done: untitled.length === 0,
      detail: untitled.length > 0 ? `Rename ${names(untitled)}.` : null,
    },
    {
      id: 'final',
      label: 'Everything is marked Final',
      done: nodes.length > 0 && notFinal.length === 0,
      detail:
        nodes.length > 0
          ? `Not final yet: ${names(notFinal)}. Mark each part Final once you have reviewed it.`
          : 'Add and review your chapters.',
    },
  ].map((item) => ({ ...item, detail: item.done ? null : item.detail }));
}
