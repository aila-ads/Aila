import type { PhrasingContent, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { WriterDocumentType, WriterNodeKind } from '@aila/validation';
import { readingOrder, type TreeNode } from '../structure';

/**
 * The export model (docs/products/WRITER.md §31): one structure shared by
 * the PDF, DOCX and EPUB writers so each preserves the same title, author,
 * headings, chapter hierarchy, paragraphs, lists, links, basic formatting
 * and order. Markdown is parsed to a syntax tree; raw HTML and images are
 * never carried into an export.
 */

export type Inline = {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly code?: boolean;
  /** http, https or mailto only. */
  readonly link?: string;
};

export type Block =
  | { readonly type: 'heading'; readonly level: number; readonly inlines: readonly Inline[] }
  | { readonly type: 'paragraph'; readonly inlines: readonly Inline[] }
  | {
      readonly type: 'list';
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly (readonly Block[])[];
    }
  | { readonly type: 'quote'; readonly blocks: readonly Block[] }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'rule' };

export type ExportSection = {
  readonly id: string;
  readonly kind: WriterNodeKind;
  readonly title: string;
  /** 0 for the top of the export. */
  readonly depth: number;
  /** Heading level of the section title, 1-6. */
  readonly level: number;
  /** Starts a new page (and a new EPUB file). */
  readonly startsPage: boolean;
  readonly blocks: readonly Block[];
};

export type ExportDocument = {
  readonly title: string;
  readonly subtitle: string | null;
  readonly author: string | null;
  readonly description: string | null;
  readonly language: string;
  readonly documentType: WriterDocumentType;
  readonly sections: readonly ExportSection[];
};

/** Characters XML 1.0 and PDF text cannot carry. */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g, '').replace(/[\ud800-\udfff]/g, (char, index, all) => {
    const code = char.charCodeAt(0);
    // Keep valid surrogate pairs, drop lone halves.
    if (code <= 0xdbff) {
      const next = all.charCodeAt(index + 1);
      return next >= 0xdc00 && next <= 0xdfff ? char : '';
    }
    const previous = all.charCodeAt(index - 1);
    return previous >= 0xd800 && previous <= 0xdbff ? char : '';
  });
}

/** A link target that is safe to put in a file: http, https or mailto. */
export function safeLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function inlinesOf(nodes: readonly PhrasingContent[], style: Omit<Inline, 'text'> = {}): Inline[] {
  const result: Inline[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        result.push({ ...style, text: cleanText(node.value.replace(/\s*\n\s*/g, ' ')) });
        break;
      case 'strong':
        result.push(...inlinesOf(node.children, { ...style, bold: true }));
        break;
      case 'emphasis':
        result.push(...inlinesOf(node.children, { ...style, italic: true }));
        break;
      case 'inlineCode':
        result.push({ ...style, code: true, text: cleanText(node.value) });
        break;
      case 'break':
        result.push({ ...style, text: '\n' });
        break;
      case 'link': {
        const link = safeLink(node.url);
        result.push(...inlinesOf(node.children, link ? { ...style, link } : style));
        break;
      }
      case 'image':
        if (node.alt) result.push({ ...style, text: cleanText(node.alt) });
        break;
      default:
        // Raw HTML, footnote references and anything else are left out.
        break;
    }
  }

  return result.filter((inline) => inline.text.length > 0);
}

function blocksOf(nodes: readonly RootContent[], headingOffset: number): Block[] {
  const blocks: Block[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'heading': {
        const inlines = inlinesOf(node.children);
        if (inlines.length > 0) blocks.push({ type: 'heading', level: Math.min(6, node.depth + headingOffset), inlines });
        break;
      }
      case 'paragraph': {
        const inlines = inlinesOf(node.children);
        if (inlines.some((inline) => inline.text.trim())) blocks.push({ type: 'paragraph', inlines });
        break;
      }
      case 'list':
        blocks.push({
          type: 'list',
          ordered: Boolean(node.ordered),
          start: node.start ?? 1,
          items: node.children.map((item) => blocksOf(item.children, headingOffset)),
        });
        break;
      case 'blockquote':
        blocks.push({ type: 'quote', blocks: blocksOf(node.children, headingOffset) });
        break;
      case 'code':
        blocks.push({ type: 'code', text: cleanText(node.value) });
        break;
      case 'thematicBreak':
        blocks.push({ type: 'rule' });
        break;
      default:
        break;
    }
  }

  return blocks;
}

/**
 * Markdown to blocks. `headingOffset` moves the text's own headings below
 * the title of the part they belong to.
 */
export function markdownToBlocks(markdown: string, headingOffset = 0): Block[] {
  return blocksOf(fromMarkdown(markdown).children, headingOffset);
}

export type ExportNode = TreeNode & { readonly content: string };

/** Section heading level from its depth in the export. */
export function sectionLevel(depth: number): number {
  return Math.min(6, depth + 1);
}

/**
 * The document for a project or one part of it, in reading order. Chapters
 * and anything at the top of the export start a new page.
 */
export function buildExportDocument(
  project: {
    readonly title: string;
    readonly subtitle: string | null;
    readonly authorName: string | null;
    readonly description: string | null;
    readonly language: string;
    readonly documentType: WriterDocumentType;
  },
  nodes: readonly ExportNode[],
  rootId: string | null,
): ExportDocument {
  const ordered = readingOrder(nodes, rootId);

  return {
    title: cleanText(project.title),
    subtitle: project.subtitle ? cleanText(project.subtitle) : null,
    author: project.authorName ? cleanText(project.authorName) : null,
    description: project.description ? cleanText(project.description) : null,
    language: project.language,
    documentType: project.documentType,
    sections: ordered.map((node, index) => {
      const level = sectionLevel(node.depth);
      return {
        id: node.id,
        kind: node.kind,
        title: cleanText(node.title),
        depth: node.depth,
        level,
        startsPage: index === 0 || node.depth === 0 || node.kind === 'CHAPTER',
        blocks: markdownToBlocks(node.content, level),
      };
    }),
  };
}

/** Plain text of inlines. */
export function plainText(inlines: readonly Inline[]): string {
  return inlines.map((inline) => inline.text).join('');
}

/** A file name from the title: letters, digits, spaces and dashes only. */
export function exportFileName(title: string, extension: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return `${base || 'Aila Writer export'}.${extension}`;
}
