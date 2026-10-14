import { z } from 'zod';
import { cleanTitle } from './intelligence';

/**
 * Aila Writer input (docs/products/WRITER.md). The same schemas run in the
 * API and the browser, so limits match. Every ID only names a record: the
 * server always looks it up within the signed-in account.
 */

export const WRITER_DOCUMENT_TYPES = [
  'BOOK',
  'NOVEL',
  'NONFICTION',
  'REPORT',
  'THESIS',
  'MANUSCRIPT',
  'GUIDE',
  'ARTICLE',
  'BLOG',
  'DOCUMENTATION',
  'RESEARCH_NOTES',
  'OTHER',
] as const;
export type WriterDocumentType = (typeof WRITER_DOCUMENT_TYPES)[number];

export const WRITER_DOCUMENT_TYPE_LABELS: Readonly<Record<WriterDocumentType, string>> = {
  BOOK: 'Book',
  NOVEL: 'Novel',
  NONFICTION: 'Nonfiction book',
  REPORT: 'Report',
  THESIS: 'Thesis-style document',
  MANUSCRIPT: 'Manuscript',
  GUIDE: 'Long-form guide',
  ARTICLE: 'Article',
  BLOG: 'Blog post',
  DOCUMENTATION: 'Documentation',
  RESEARCH_NOTES: 'Research notes',
  OTHER: 'Other',
};

export const WRITER_NODE_KINDS = ['DOCUMENT', 'PART', 'CHAPTER', 'SECTION'] as const;
export type WriterNodeKind = (typeof WRITER_NODE_KINDS)[number];

export const WRITER_NODE_KIND_LABELS: Readonly<Record<WriterNodeKind, string>> = {
  DOCUMENT: 'Document',
  PART: 'Part',
  CHAPTER: 'Chapter',
  SECTION: 'Section',
};

/**
 * Where each level may sit (WRITER §8): Document > Part > Chapter >
 * Section. `null` is the top of the project; not every level is needed,
 * so a book can hold chapters directly.
 */
export const WRITER_ALLOWED_PARENTS: Readonly<Record<WriterNodeKind, readonly (WriterNodeKind | null)[]>> = {
  DOCUMENT: [null],
  PART: [null, 'DOCUMENT'],
  CHAPTER: [null, 'DOCUMENT', 'PART'],
  SECTION: ['CHAPTER'],
};

/** Whether a node of `kind` may be placed under a parent of `parentKind` (null: top level). */
export function canPlaceNode(kind: WriterNodeKind, parentKind: WriterNodeKind | null): boolean {
  return WRITER_ALLOWED_PARENTS[kind].includes(parentKind);
}

export const WRITER_NODE_STATUSES = ['DRAFT', 'IN_PROGRESS', 'REVISED', 'FINAL'] as const;
export type WriterNodeStatus = (typeof WRITER_NODE_STATUSES)[number];

export const WRITER_NODE_STATUS_LABELS: Readonly<Record<WriterNodeStatus, string>> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  REVISED: 'Revised',
  FINAL: 'Final',
};

export const WRITER_RESEARCH_KINDS = ['QUESTION', 'NOTE', 'SOURCE'] as const;
export type WriterResearchKind = (typeof WRITER_RESEARCH_KINDS)[number];

export const WRITER_EXPORT_FORMATS = ['PDF', 'DOCX', 'EPUB'] as const;
export type WriterExportFormat = (typeof WRITER_EXPORT_FORMATS)[number];

/** Limits (WRITER §53: controlled sizes keep editing and AI fast). */
export const WRITER_MAX_TITLE_CHARS = 200;
export const WRITER_MAX_SHORT_TEXT_CHARS = 500;
export const WRITER_MAX_DESCRIPTION_CHARS = 5_000;
export const WRITER_MAX_CONTEXT_CHARS = 20_000;
export const WRITER_MAX_SUMMARY_CHARS = 2_000;
/** Longest content of one document, part, chapter or section (about 70,000 words). */
export const WRITER_MAX_CONTENT_CHARS = 400_000;
export const WRITER_MAX_NODES = 2_000;
export const WRITER_MAX_PROJECTS = 500;
export const WRITER_MAX_RESEARCH_ITEMS = 1_000;
export const WRITER_MAX_REFERENCES = 20;
export const WRITER_MAX_SEARCH_CHARS = 200;
export const WRITER_MAX_LABEL_CHARS = 120;
export const WRITER_MAX_URL_CHARS = 2_048;
export const WRITER_MAX_WORD_GOAL = 5_000_000;
export const WRITER_MAX_CHAPTER_GOAL = 1_000;

/**
 * Words in a text, counted the same way everywhere (WRITER §29): runs of
 * letters or digits (with their combining accents, as in Yoruba and
 * Igbo), with apostrophes and hyphens inside a word. Markdown
 * markers such as `#`, `*` and `-` are not words.
 */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu)?.length ?? 0;
}

/** Characters as a reader sees them (code points, not UTF-16 units). */
export function countCharacters(text: string): number {
  let count = 0;

  for (const _ of text) {
    count += 1;
  }

  return count;
}

const writerId = (message: string) => z.string().regex(/^[A-Za-z0-9-]{1,64}$/, { error: message });

export const writerProjectIdField = writerId('We could not find that project.');
export const writerNodeIdField = writerId('We could not find that part of the project.');
const versionIdField = writerId('We could not find that version.');
const researchIdField = writerId('We could not find that research item.');
const fileIdField = writerId('We could not find that file.');
const exportIdField = writerId('We could not find that export.');

const title = (label: string) =>
  z
    .string()
    .transform(cleanTitle)
    .pipe(
      z
        .string()
        .min(1, { error: `Enter a ${label}.` })
        .max(WRITER_MAX_TITLE_CHARS, { error: `The ${label} can be up to ${WRITER_MAX_TITLE_CHARS} characters.` }),
    );

/** Optional free text: trimmed, empty becomes null, with a length limit. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, { error: `${label} can be up to ${max.toLocaleString('en-US')} characters.` })
    .transform((value) => {
      const cleaned = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
      return cleaned.length > 0 ? cleaned : null;
    })
    .nullable()
    .transform((value) => value ?? null);

const optionalLine = (max: number, label: string) =>
  z
    .string()
    .max(max, { error: `${label} can be up to ${max} characters.` })
    .transform((value) => {
      const cleaned = cleanTitle(value);
      return cleaned.length > 0 ? cleaned : null;
    })
    .nullable()
    .transform((value) => value ?? null);

const goal = (max: number) => z.number().int().min(1).max(max).nullable();

/** BCP 47-style language tag, e.g. "en", "en-GB", "ig", "yo", "fr". */
export const writerLanguageSchema = z
  .string()
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, { error: 'Choose a language.' });

/** Project metadata and context the user can edit (WRITER §7.1, §22, §30). */
const projectFields = {
  title: title('title'),
  subtitle: optionalLine(WRITER_MAX_TITLE_CHARS, 'The subtitle'),
  description: optionalText(WRITER_MAX_DESCRIPTION_CHARS, 'The description'),
  documentType: z.enum(WRITER_DOCUMENT_TYPES),
  language: writerLanguageSchema,
  audience: optionalLine(WRITER_MAX_SHORT_TEXT_CHARS, 'The target audience'),
  authorName: optionalLine(WRITER_MAX_TITLE_CHARS, 'The author name'),
  goals: optionalText(WRITER_MAX_CONTEXT_CHARS, 'Writing goals'),
  styleInstructions: optionalText(WRITER_MAX_CONTEXT_CHARS, 'Style instructions'),
  terminology: optionalText(WRITER_MAX_CONTEXT_CHARS, 'Terminology'),
  contextNotes: optionalText(WRITER_MAX_CONTEXT_CHARS, 'Project notes'),
  wordGoal: goal(WRITER_MAX_WORD_GOAL),
  chapterGoal: goal(WRITER_MAX_CHAPTER_GOAL),
};

export const createWriterProjectSchema = z.strictObject({
  title: projectFields.title,
  documentType: projectFields.documentType,
  language: projectFields.language.default('en'),
  description: projectFields.description.optional(),
});
export type CreateWriterProjectInput = z.infer<typeof createWriterProjectSchema>;

export const updateWriterProjectSchema = z.strictObject({
  projectId: writerProjectIdField,
  title: projectFields.title.optional(),
  subtitle: projectFields.subtitle.optional(),
  description: projectFields.description.optional(),
  documentType: projectFields.documentType.optional(),
  language: projectFields.language.optional(),
  audience: projectFields.audience.optional(),
  authorName: projectFields.authorName.optional(),
  goals: projectFields.goals.optional(),
  styleInstructions: projectFields.styleInstructions.optional(),
  terminology: projectFields.terminology.optional(),
  contextNotes: projectFields.contextNotes.optional(),
  wordGoal: projectFields.wordGoal.optional(),
  chapterGoal: projectFields.chapterGoal.optional(),
});
export type UpdateWriterProjectInput = z.infer<typeof updateWriterProjectSchema>;

export const writerProjectIdSchema = z.strictObject({ projectId: writerProjectIdField });

export const writerProjectStatusSchema = z.strictObject({
  projectId: writerProjectIdField,
  archived: z.boolean(),
});

export const writerNodeIdSchema = z.strictObject({ nodeId: writerNodeIdField });

export const createWriterNodeSchema = z.strictObject({
  projectId: writerProjectIdField,
  parentId: writerNodeIdField.nullable(),
  kind: z.enum(WRITER_NODE_KINDS),
  title: title('title'),
});
export type CreateWriterNodeInput = z.infer<typeof createWriterNodeSchema>;

export const updateWriterNodeSchema = z.strictObject({
  nodeId: writerNodeIdField,
  title: title('title').optional(),
  summary: optionalText(WRITER_MAX_SUMMARY_CHARS, 'The synopsis').optional(),
  status: z.enum(WRITER_NODE_STATUSES).optional(),
});
export type UpdateWriterNodeInput = z.infer<typeof updateWriterNodeSchema>;

/**
 * A content save (WRITER §12-13). `baseRevision` is the revision the
 * browser's text was based on; the server refuses the save when newer
 * content exists, so nothing is overwritten silently.
 */
export const saveWriterContentSchema = z.strictObject({
  nodeId: writerNodeIdField,
  content: z.string().max(WRITER_MAX_CONTENT_CHARS, {
    error: `A single part can be up to ${WRITER_MAX_CONTENT_CHARS.toLocaleString('en-US')} characters. Split it into sections.`,
  }),
  baseRevision: z.number().int().min(1),
  /** Keep a version of the text before this save, e.g. before applying an AI suggestion. */
  keepVersion: z.enum(['AI']).optional(),
});
export type SaveWriterContentInput = z.infer<typeof saveWriterContentSchema>;

export const moveWriterNodeSchema = z.strictObject({
  nodeId: writerNodeIdField,
  parentId: writerNodeIdField.nullable(),
  /** Position among the new siblings, 0 first. Larger values put it last. */
  index: z.number().int().min(0).max(WRITER_MAX_NODES),
});
export type MoveWriterNodeInput = z.infer<typeof moveWriterNodeSchema>;

export const createWriterVersionSchema = z.strictObject({
  nodeId: writerNodeIdField,
  label: optionalLine(WRITER_MAX_LABEL_CHARS, 'The version name').optional(),
});

export const writerVersionIdSchema = z.strictObject({ versionId: versionIdField });

export const restoreWriterVersionSchema = z.strictObject({
  versionId: versionIdField,
  /** The revision the user is looking at, so a restore never replaces unseen work. */
  baseRevision: z.number().int().min(1),
});

/** http(s) only, for research sources (WRITER §24). */
const sourceUrl = z
  .string()
  .trim()
  .max(WRITER_MAX_URL_CHARS)
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
      } catch {
        return false;
      }
    },
    { error: 'Enter a web address starting with http:// or https://.' },
  )
  .transform((value) => (value ? value : null))
  .nullable()
  .transform((value) => value ?? null);

const researchFields = {
  kind: z.enum(WRITER_RESEARCH_KINDS),
  title: title('title'),
  body: optionalText(WRITER_MAX_CONTEXT_CHARS, 'Notes'),
  url: sourceUrl,
  sourceTitle: optionalLine(WRITER_MAX_TITLE_CHARS, 'The source title'),
};

export const createWriterResearchSchema = z.strictObject({
  projectId: writerProjectIdField,
  kind: researchFields.kind,
  title: researchFields.title,
  body: researchFields.body.optional(),
  url: researchFields.url.optional(),
  sourceTitle: researchFields.sourceTitle.optional(),
});
export type CreateWriterResearchInput = z.infer<typeof createWriterResearchSchema>;

export const updateWriterResearchSchema = z.strictObject({
  researchId: researchIdField,
  title: researchFields.title.optional(),
  body: researchFields.body.optional(),
  url: researchFields.url.optional(),
  sourceTitle: researchFields.sourceTitle.optional(),
});
export type UpdateWriterResearchInput = z.infer<typeof updateWriterResearchSchema>;

export const writerResearchIdSchema = z.strictObject({ researchId: researchIdField });

export const writerReferenceSchema = z.strictObject({
  projectId: writerProjectIdField,
  fileId: fileIdField,
});

export const writerSearchSchema = z.strictObject({
  query: z
    .string()
    .transform(cleanTitle)
    .pipe(
      z
        .string()
        .min(2, { error: 'Search for at least 2 characters.' })
        .max(WRITER_MAX_SEARCH_CHARS, { error: `Searches can be up to ${WRITER_MAX_SEARCH_CHARS} characters.` }),
    ),
  /** Search one project; omitted to search every project of the account. */
  projectId: writerProjectIdField.optional(),
});
export type WriterSearchInput = z.infer<typeof writerSearchSchema>;

export const createWriterExportSchema = z.strictObject({
  projectId: writerProjectIdField,
  /** Export one document, part, chapter or section with what it contains; omitted for the whole project. */
  nodeId: writerNodeIdField.optional(),
  format: z.enum(WRITER_EXPORT_FORMATS),
  /** Generated by the browser per request, so a repeated submission does not export twice. */
  requestKey: z.uuid(),
});
export type CreateWriterExportInput = z.infer<typeof createWriterExportSchema>;

export const writerExportIdSchema = z.strictObject({ exportId: exportIdField });

/**
 * AI operations (WRITER §17). Each has fixed instructions on the server;
 * the browser only names the operation.
 */
export const WRITER_AI_OPERATIONS = [
  'rewrite',
  'improve',
  'expand',
  'shorten',
  'tone',
  'grammar',
  'edit',
  'continue',
  'summarize',
  'outline',
  'brainstorm',
  'structure',
  'continuity',
  'research',
] as const;
export type WriterAiOperation = (typeof WRITER_AI_OPERATIONS)[number];

/** Operations that change the selected text and return a replacement for it. */
export const WRITER_TRANSFORM_OPERATIONS: readonly WriterAiOperation[] = [
  'rewrite',
  'improve',
  'expand',
  'shorten',
  'tone',
  'grammar',
];

/** Operations that need selected text (or the whole text when nothing is selected). */
export const WRITER_TEXT_OPERATIONS: readonly WriterAiOperation[] = [...WRITER_TRANSFORM_OPERATIONS, 'edit'];

export const WRITER_AI_OPERATION_LABELS: Readonly<Record<WriterAiOperation, string>> = {
  rewrite: 'Rewrite',
  improve: 'Improve writing',
  expand: 'Expand',
  shorten: 'Shorten',
  tone: 'Change tone',
  grammar: 'Correct grammar',
  edit: 'Edit suggestions',
  continue: 'Continue writing',
  summarize: 'Summarize',
  outline: 'Outline',
  brainstorm: 'Brainstorm',
  structure: 'Analyze structure',
  continuity: 'Check continuity',
  research: 'Research assistance',
};

export const WRITER_TONES = [
  'formal',
  'friendly',
  'confident',
  'persuasive',
  'academic',
  'conversational',
  'literary',
  'simple',
  'custom',
] as const;
export type WriterTone = (typeof WRITER_TONES)[number];

export const WRITER_AI_CAPABILITIES = ['fast', 'balanced', 'reasoning'] as const;
export const WRITER_WEB_SEARCH_MODES = ['off', 'on'] as const;

/** Longest selected passage sent to the AI (WRITER §18: only what is needed). */
export const WRITER_MAX_SELECTION_CHARS = 30_000;
/** Text before the cursor sent for "Continue". */
export const WRITER_MAX_BEFORE_CHARS = 8_000;
export const WRITER_MAX_INSTRUCTION_CHARS = 2_000;
export const WRITER_MAX_TONE_CHARS = 100;
export const WRITER_MAX_AI_FILES = 3;

export const writerAssistSchema = z
  .strictObject({
    nodeId: writerNodeIdField,
    operation: z.enum(WRITER_AI_OPERATIONS),
    selection: z
      .string()
      .max(WRITER_MAX_SELECTION_CHARS, {
        error: `Select up to ${WRITER_MAX_SELECTION_CHARS.toLocaleString('en-US')} characters at a time.`,
      })
      .default(''),
    /** Text just before the cursor, for "Continue". */
    before: z.string().max(WRITER_MAX_BEFORE_CHARS).default(''),
    instruction: z
      .string()
      .max(WRITER_MAX_INSTRUCTION_CHARS, {
        error: `Instructions can be up to ${WRITER_MAX_INSTRUCTION_CHARS.toLocaleString('en-US')} characters.`,
      })
      .default(''),
    tone: z.enum(WRITER_TONES).optional(),
    customTone: z.string().max(WRITER_MAX_TONE_CHARS).default(''),
    capability: z.enum(WRITER_AI_CAPABILITIES).default('balanced'),
    webSearch: z.enum(WRITER_WEB_SEARCH_MODES).default('off'),
    /** Reference files of the project to use; checked against the project on the server. */
    fileIds: z
      .array(fileIdField)
      .max(WRITER_MAX_AI_FILES, { error: `Use up to ${WRITER_MAX_AI_FILES} reference files at a time.` })
      .default([]),
    requestKey: z.uuid(),
  })
  .superRefine((value, issues) => {
    if (WRITER_TRANSFORM_OPERATIONS.includes(value.operation) && !value.selection.trim()) {
      issues.addIssue({ code: 'custom', path: ['selection'], message: 'Select the text you want Aila to work on.' });
    }

    if (value.operation === 'tone' && !value.tone) {
      issues.addIssue({ code: 'custom', path: ['tone'], message: 'Choose a tone.' });
    }

    if (value.tone === 'custom' && !value.customTone.trim()) {
      issues.addIssue({ code: 'custom', path: ['customTone'], message: 'Describe the tone you want.' });
    }

    if ((value.operation === 'research' || value.operation === 'brainstorm') && !value.instruction.trim()) {
      issues.addIssue({
        code: 'custom',
        path: ['instruction'],
        message: value.operation === 'research' ? 'Write your research question.' : 'Say what to brainstorm.',
      });
    }

    if (value.webSearch === 'on' && value.operation !== 'research') {
      issues.addIssue({ code: 'custom', path: ['webSearch'], message: 'Web search is available for research.' });
    }
  });
export type WriterAssistInput = z.infer<typeof writerAssistSchema>;
