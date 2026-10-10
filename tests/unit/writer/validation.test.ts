import { describe, expect, it } from 'vitest';
import {
  WRITER_MAX_CONTENT_CHARS,
  canPlaceNode,
  countCharacters,
  countWords,
  createWriterExportSchema,
  createWriterNodeSchema,
  createWriterProjectSchema,
  createWriterResearchSchema,
  saveWriterContentSchema,
  updateWriterProjectSchema,
  writerAssistSchema,
  writerSearchSchema,
} from '../../../packages/validation/src/writer';

const KEY = '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90';
const NODE = '01926f0e-8a5b-7c3d-9e2f-1a2b3c4d5e6f';

describe('Writer word and character counts', () => {
  it('counts words, not Markdown markers', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('## Chapter One\n\n- **Bold** move, *quietly*.')).toBe(5);
    expect(countWords("It's a well-known fact — 2026 rocks")).toBe(6);
    expect(countWords('Ọ̀rụ́ in Enugu. Привет мир. 你好')).toBe(6);
  });

  it('counts characters as code points', () => {
    expect(countCharacters('abc')).toBe(3);
    expect(countCharacters('😀a')).toBe(2);
  });
});

describe('Writer hierarchy', () => {
  it('allows only the documented placements', () => {
    expect(canPlaceNode('CHAPTER', null)).toBe(true);
    expect(canPlaceNode('CHAPTER', 'PART')).toBe(true);
    expect(canPlaceNode('SECTION', 'CHAPTER')).toBe(true);
    expect(canPlaceNode('SECTION', null)).toBe(false);
    expect(canPlaceNode('PART', 'CHAPTER')).toBe(false);
    expect(canPlaceNode('DOCUMENT', 'PART')).toBe(false);
    expect(canPlaceNode('CHAPTER', 'SECTION')).toBe(false);
  });
});

describe('Writer schemas', () => {
  it('cleans project titles and rejects unknown fields such as an account id', () => {
    expect(createWriterProjectSchema.parse({ title: '  My   Book ', documentType: 'BOOK' })).toMatchObject({
      title: 'My Book',
      language: 'en',
    });
    expect(createWriterProjectSchema.safeParse({ title: 'T', documentType: 'BOOK', accountId: 'a' }).success).toBe(false);
    expect(createWriterProjectSchema.safeParse({ title: '   ', documentType: 'BOOK' }).success).toBe(false);
    expect(createWriterProjectSchema.safeParse({ title: 'T', documentType: 'POEM' }).success).toBe(false);
    expect(createWriterProjectSchema.safeParse({ title: 'T', documentType: 'BOOK', language: 'en"; drop' }).success).toBe(false);
  });

  it('keeps project updates partial and clears empty text to null', () => {
    const parsed = updateWriterProjectSchema.parse({ projectId: 'p1', subtitle: '   ', wordGoal: 80000 });
    expect(parsed).toEqual({ projectId: 'p1', subtitle: null, wordGoal: 80000 });
    expect(updateWriterProjectSchema.safeParse({ projectId: 'p1', wordGoal: 0 }).success).toBe(false);
  });

  it('rejects malformed ids', () => {
    expect(createWriterNodeSchema.safeParse({ projectId: '../x', parentId: null, kind: 'CHAPTER', title: 'A' }).success).toBe(false);
    expect(createWriterNodeSchema.safeParse({ projectId: 'p1', parentId: null, kind: 'CHAPTER', title: 'A' }).success).toBe(true);
  });

  it('limits content and requires a base revision', () => {
    expect(saveWriterContentSchema.safeParse({ nodeId: NODE, content: 'x', baseRevision: 0 }).success).toBe(false);
    expect(
      saveWriterContentSchema.safeParse({ nodeId: NODE, content: 'x'.repeat(WRITER_MAX_CONTENT_CHARS + 1), baseRevision: 1 })
        .success,
    ).toBe(false);
    expect(saveWriterContentSchema.safeParse({ nodeId: NODE, content: '', baseRevision: 1, keepVersion: 'AI' }).success).toBe(true);
    expect(saveWriterContentSchema.safeParse({ nodeId: NODE, content: '', baseRevision: 1, keepVersion: 'ANY' }).success).toBe(false);
  });

  it('accepts only http(s) research links without credentials', () => {
    const base = { projectId: 'p1', kind: 'SOURCE' as const, title: 'Source' };
    expect(createWriterResearchSchema.safeParse({ ...base, url: 'https://example.com/a' }).success).toBe(true);
    expect(createWriterResearchSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(createWriterResearchSchema.safeParse({ ...base, url: 'https://user:pw@example.com' }).success).toBe(false);
    expect(createWriterResearchSchema.parse({ ...base, url: '' }).url).toBeNull();
  });

  it('requires a request key for exports and at least two characters to search', () => {
    expect(createWriterExportSchema.safeParse({ projectId: 'p1', format: 'PDF', requestKey: 'x' }).success).toBe(false);
    expect(createWriterExportSchema.safeParse({ projectId: 'p1', format: 'EPUB', requestKey: KEY }).success).toBe(true);
    expect(createWriterExportSchema.safeParse({ projectId: 'p1', format: 'HTML', requestKey: KEY }).success).toBe(false);
    expect(writerSearchSchema.safeParse({ query: ' a ' }).success).toBe(false);
    expect(writerSearchSchema.parse({ query: '  the   river ' }).query).toBe('the river');
  });
});

describe('writerAssistSchema', () => {
  const base = { nodeId: NODE, requestKey: KEY };

  it('needs selected text for transformations', () => {
    expect(writerAssistSchema.safeParse({ ...base, operation: 'rewrite' }).success).toBe(false);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'rewrite', selection: 'Text' }).success).toBe(true);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'summarize' }).success).toBe(true);
  });

  it('needs a tone, and a description for a custom tone', () => {
    expect(writerAssistSchema.safeParse({ ...base, operation: 'tone', selection: 'x' }).success).toBe(false);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'tone', selection: 'x', tone: 'custom' }).success).toBe(false);
    expect(
      writerAssistSchema.safeParse({ ...base, operation: 'tone', selection: 'x', tone: 'custom', customTone: 'wry' }).success,
    ).toBe(true);
  });

  it('needs a question for research and allows web search only there', () => {
    expect(writerAssistSchema.safeParse({ ...base, operation: 'research' }).success).toBe(false);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'research', instruction: 'When?', webSearch: 'on' }).success).toBe(true);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'outline', webSearch: 'on' }).success).toBe(false);
  });

  it('rejects unknown operations, extra fields and too many files', () => {
    expect(writerAssistSchema.safeParse({ ...base, operation: 'publish' }).success).toBe(false);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'outline', system: 'x' }).success).toBe(false);
    expect(writerAssistSchema.safeParse({ ...base, operation: 'outline', fileIds: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });
});
