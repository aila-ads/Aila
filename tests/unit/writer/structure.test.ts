import { describe, expect, it } from 'vitest';
import {
  insertAt,
  projectStats,
  publishingChecklist,
  readingOrder,
  renumber,
  subtreeIds,
} from '../../../apps/web/server/writer/structure';

type Kind = 'DOCUMENT' | 'PART' | 'CHAPTER' | 'SECTION';
type Status = 'DRAFT' | 'IN_PROGRESS' | 'REVISED' | 'FINAL';

const node = (id: string, parentId: string | null, kind: Kind, position: number, wordCount = 0, status: Status = 'DRAFT') => ({
  id,
  parentId,
  kind,
  title: id,
  position,
  wordCount,
  charCount: wordCount * 5,
  status,
});

const nodes = [
  node('c2', null, 'CHAPTER', 1, 100),
  node('p1', null, 'PART', 0),
  node('c1', 'p1', 'CHAPTER', 0, 50, 'FINAL'),
  node('s1', 'c1', 'SECTION', 0, 20),
];

describe('Writer structure', () => {
  it('lists parts in reading order with depth', () => {
    expect(readingOrder(nodes).map((item) => [item.id, item.depth])).toEqual([
      ['p1', 0],
      ['c1', 1],
      ['s1', 2],
      ['c2', 0],
    ]);
  });

  it('finds everything inside a part', () => {
    expect([...subtreeIds(nodes, 'p1')].sort()).toEqual(['c1', 'p1', 's1']);
    expect([...subtreeIds(nodes, 'c2')]).toEqual(['c2']);
  });

  it('inserts and renumbers positions', () => {
    const list = insertAt([{ id: 'a' }, { id: 'b' }], { id: 'x' }, 1);
    expect(list.map((item) => item.id)).toEqual(['a', 'x', 'b']);
    expect(insertAt([{ id: 'a' }], { id: 'x' }, 99).map((item) => item.id)).toEqual(['a', 'x']);
    expect(renumber([{ id: 'a', position: 4 }, { id: 'b', position: 9 }])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });

  it('calculates statistics and goal progress', () => {
    const stats = projectStats(nodes, { wordGoal: 340, chapterGoal: 4 });
    expect(stats).toMatchObject({ words: 170, chapters: 2, sections: 1, parts: 1, finalCount: 1 });
    expect(stats.wordGoalPercent).toBe(50);
    expect(stats.chapterGoalPercent).toBe(50);
    expect(projectStats(nodes, { wordGoal: null, chapterGoal: null }).wordGoalPercent).toBeNull();
  });

  it('reports what is still missing before publishing', () => {
    const checks = publishingChecklist({ title: 'T', subtitle: null, description: null, authorName: 'A' }, nodes);
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    expect(byId.title!.done).toBe(true);
    expect(byId.author!.done).toBe(true);
    expect(byId.description!.done).toBe(false);
    expect(byId.content!.done).toBe(true);
    expect(byId.final!.done).toBe(false);
    expect(byId.final!.detail).toContain('Not final yet');
    expect(checks.filter((check) => check.done).every((check) => check.detail === null)).toBe(true);
  });
});
