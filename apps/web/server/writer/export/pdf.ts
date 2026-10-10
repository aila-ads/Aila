import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Block, ExportDocument, ExportSection, Inline } from './document';

/**
 * PDF (docs/products/WRITER.md §31) with pdf-lib. Noto Serif is embedded
 * in full (pdf-lib's subsetter drops glyphs from this font) so every Latin script used by Aila's languages prints
 * correctly, including Igbo and Yoruba diacritics. Layout: title page,
 * chapters on new pages, headings, wrapped paragraphs, lists, quotes,
 * clickable links, page numbers. Book-like projects use a 6 × 9 inch
 * page; everything else A4.
 */

export const PDF_MIME = 'application/pdf';

type Fonts = { readonly regular: PDFFont; readonly bold: PDFFont; readonly italic: PDFFont; readonly boldItalic: PDFFont };

/**
 * The embedded fonts (OFL, see fonts/OFL.txt). Referenced with
 * `new URL(…, import.meta.url)` so the bundler ships them with the server
 * code that needs them, and tests read them from the repository.
 */
const FONT_URLS = {
  regular: new URL('../fonts/NotoSerif-Regular.ttf', import.meta.url),
  bold: new URL('../fonts/NotoSerif-Bold.ttf', import.meta.url),
  italic: new URL('../fonts/NotoSerif-Italic.ttf', import.meta.url),
  boldItalic: new URL('../fonts/NotoSerif-BoldItalic.ttf', import.meta.url),
} as const;

let fontBytes: Promise<Record<keyof typeof FONT_URLS, Uint8Array>> | undefined;

function loadFontBytes() {
  fontBytes ??= (async () => {
    const entries = await Promise.all(
      Object.entries(FONT_URLS).map(async ([key, url]) => [key, new Uint8Array(await readFile(url))] as const),
    );
    return Object.fromEntries(entries) as Record<keyof typeof FONT_URLS, Uint8Array>;
  })().catch((error: unknown) => {
    fontBytes = undefined;
    throw error;
  });
  return fontBytes;
}

const BOOK_TYPES = new Set(['BOOK', 'NOVEL', 'NONFICTION', 'MANUSCRIPT']);
const INK = rgb(0.12, 0.11, 0.1);
const LINK = rgb(0.2, 0.25, 0.45);
const MUTED = rgb(0.4, 0.38, 0.35);
const HEADING_SIZES = [22, 17, 14.5, 13, 12, 11.5];

type Token = {
  readonly text: string;
  readonly font: PDFFont;
  readonly size: number;
  readonly link: string | null;
  readonly space: boolean;
  readonly width: number;
};

type Line = { readonly tokens: Token[]; readonly width: number };

class Layout {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly bodySize: number;
  page!: PDFPage;
  y = 0;
  /** Whether anything has been drawn on the current page. */
  blank = true;

  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: Fonts,
    book: boolean,
  ) {
    this.width = book ? 432 : 595.28;
    this.height = book ? 648 : 841.89;
    this.margin = book ? 54 : 72;
    this.bodySize = book ? 11 : 11.5;
  }

  get contentWidth(): number {
    return this.width - this.margin * 2;
  }

  newPage(): void {
    this.page = this.pdf.addPage([this.width, this.height]);
    this.y = this.height - this.margin;
    this.blank = true;
  }

  /** Starts a new page unless `height` still fits. */
  ensure(height: number): void {
    if (this.y - height < this.margin) {
      this.newPage();
    }
  }

  font(inline: { bold?: boolean; italic?: boolean }): PDFFont {
    if (inline.bold && inline.italic) return this.fonts.boldItalic;
    if (inline.bold) return this.fonts.bold;
    if (inline.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  tokens(inlines: readonly Inline[], size: number, style: { bold?: boolean; italic?: boolean } = {}): (Token | 'break')[] {
    const result: (Token | 'break')[] = [];

    for (const inline of inlines) {
      if (inline.text === '\n') {
        result.push('break');
        continue;
      }

      const font = this.font({ bold: inline.bold || style.bold, italic: inline.italic || style.italic });

      for (const part of inline.text.replace(/\t/g, '    ').split(/(\s+)/)) {
        if (!part) continue;
        const space = /^\s+$/.test(part);
        const text = space ? ' ' : part;
        result.push({ text, font, size, link: inline.link ?? null, space, width: font.widthOfTextAtSize(text, size) });
      }
    }

    return result;
  }

  /** Splits a word wider than the line into pieces that fit. */
  private splitWord(token: Token, maxWidth: number): Token[] {
    const pieces: Token[] = [];
    let current = '';

    for (const char of token.text) {
      const next = current + char;

      if (current && token.font.widthOfTextAtSize(next, token.size) > maxWidth) {
        pieces.push({ ...token, text: current, width: token.font.widthOfTextAtSize(current, token.size) });
        current = char;
      } else {
        current = next;
      }
    }

    if (current) pieces.push({ ...token, text: current, width: token.font.widthOfTextAtSize(current, token.size) });
    return pieces;
  }

  wrap(tokens: readonly (Token | 'break')[], maxWidth: number): Line[] {
    const lines: Line[] = [];
    let line: Token[] = [];
    let width = 0;

    const finish = () => {
      while (line.length > 0 && line.at(-1)!.space) {
        width -= line.pop()!.width;
      }
      lines.push({ tokens: line, width });
      line = [];
      width = 0;
    };

    for (const item of tokens) {
      if (item === 'break') {
        finish();
        continue;
      }

      if (item.space && line.length === 0) continue;

      const pieces = !item.space && item.width > maxWidth ? this.splitWord(item, maxWidth) : [item];

      for (const piece of pieces) {
        if (!piece.space && width + piece.width > maxWidth && line.length > 0) {
          finish();
        }

        if (piece.space && line.length === 0) continue;
        line.push(piece);
        width += piece.width;
      }
    }

    if (line.length > 0) finish();
    return lines;
  }

  addLink(x: number, y: number, width: number, height: number, url: string): void {
    const annotation = this.pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    this.page.node.addAnnot(this.pdf.context.register(annotation));
  }

  /** Draws wrapped text and moves down. */
  paragraph(
    inlines: readonly Inline[],
    options: {
      size?: number;
      indent?: number;
      align?: 'left' | 'center';
      style?: { bold?: boolean; italic?: boolean };
      after?: number;
      color?: ReturnType<typeof rgb>;
      keepWithNext?: number;
    } = {},
  ): void {
    const size = options.size ?? this.bodySize;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.45;
    const maxWidth = this.contentWidth - indent;
    const lines = this.wrap(this.tokens(inlines, size, options.style), maxWidth);

    if (options.keepWithNext) {
      this.ensure(lines.length * lineHeight + options.keepWithNext);
    }

    for (const line of lines) {
      this.ensure(lineHeight);
      const baseline = this.y - size;
      let x = this.margin + indent + (options.align === 'center' ? (maxWidth - line.width) / 2 : 0);

      for (const token of line.tokens) {
        if (!token.space) {
          this.page.drawText(token.text, { x, y: baseline, size: token.size, font: token.font, color: token.link ? LINK : (options.color ?? INK) });

          if (token.link) {
            this.page.drawLine({
              start: { x, y: baseline - 1.5 },
              end: { x: x + token.width, y: baseline - 1.5 },
              thickness: 0.5,
              color: LINK,
            });
            this.addLink(x, baseline - 3, token.width, size + 3, token.link);
          }
        }

        x += token.width;
      }

      this.y -= lineHeight;
      this.blank = false;
    }

    this.y -= options.after ?? size * 0.6;
  }

  block(block: Block, indent = 0, quote = false): void {
    switch (block.type) {
      case 'heading': {
        const size = HEADING_SIZES[block.level - 1] ?? this.bodySize;
        this.y -= size * 0.5;
        this.paragraph(block.inlines, { size, indent, style: { bold: true }, after: size * 0.4, keepWithNext: this.bodySize * 3 });
        return;
      }
      case 'paragraph':
        this.paragraph(block.inlines, { indent, style: quote ? { italic: true } : {} });
        return;
      case 'list':
        block.items.forEach((item, index) => {
          const marker = block.ordered ? `${block.start + index}.` : '•';
          const size = this.bodySize;
          this.ensure(size * 1.45);
          this.page.drawText(marker, {
            x: this.margin + indent + 4,
            y: this.y - size,
            size,
            font: this.fonts.regular,
            color: INK,
          });

          for (const child of item.length > 0 ? item : [{ type: 'paragraph' as const, inlines: [{ text: ' ' }] }]) {
            this.block(child, indent + 22, quote);
          }
        });
        this.y -= this.bodySize * 0.3;
        return;
      case 'quote':
        for (const child of block.blocks) this.block(child, indent + 24, true);
        return;
      case 'code': {
        const size = this.bodySize * 0.85;
        for (const line of block.text.split('\n')) {
          this.paragraph([{ text: line || ' ' }], { size, indent: indent + 12, after: 0, color: MUTED });
        }
        this.y -= size * 0.6;
        return;
      }
      case 'rule':
        this.paragraph([{ text: '*   *   *' }], { align: 'center' });
        return;
    }
  }

  section(section: ExportSection, kindLabel: string | null): void {
    if (section.startsPage && !this.blank) {
      this.newPage();
    }

    const size = HEADING_SIZES[section.level - 1] ?? this.bodySize;

    if (section.startsPage) {
      this.y -= this.height * 0.08;
    } else {
      this.y -= size * 0.6;
    }

    if (kindLabel) {
      this.paragraph([{ text: kindLabel.toUpperCase() }], { size: 9, align: 'center', color: MUTED, after: 4 });
    }

    this.paragraph([{ text: section.title }], {
      size,
      style: { bold: true },
      align: section.startsPage ? 'center' : 'left',
      after: section.startsPage ? size * 1.4 : size * 0.5,
      keepWithNext: this.bodySize * 3,
    });

    for (const block of section.blocks) {
      this.block(block);
    }
  }
}

export async function renderPdf(document: ExportDocument, now: Date = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const fonts: Fonts = {
    regular: await pdf.embedFont(bytes.regular, { subset: false }),
    bold: await pdf.embedFont(bytes.bold, { subset: false }),
    italic: await pdf.embedFont(bytes.italic, { subset: false }),
    boldItalic: await pdf.embedFont(bytes.boldItalic, { subset: false }),
  };

  pdf.setTitle(document.title, { showInWindowTitleBar: true });
  if (document.author) pdf.setAuthor(document.author);
  if (document.description) pdf.setSubject(document.description.slice(0, 1000));
  pdf.setLanguage(document.language);
  pdf.setCreator('Aila Writer');
  pdf.setProducer('Aila');
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  const layout = new Layout(pdf, fonts, BOOK_TYPES.has(document.documentType));

  // Title page.
  layout.newPage();
  layout.y = layout.height * 0.62;
  layout.paragraph([{ text: document.title }], { size: 26, align: 'center', style: { bold: true }, after: 14 });
  if (document.subtitle) layout.paragraph([{ text: document.subtitle }], { size: 14, align: 'center', style: { italic: true }, after: 30 });
  if (document.author) layout.paragraph([{ text: document.author }], { size: 13, align: 'center' });

  for (const section of document.sections) {
    layout.section(section, section.kind === 'PART' ? 'Part' : null);
  }

  // Page numbers on every page after the title page.
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    if (index === 0) return;
    const label = String(index + 1);
    const width = fonts.regular.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: (layout.width - width) / 2, y: layout.margin / 2, size: 9, font: fonts.regular, color: MUTED });
  });

  // Without object streams for the widest reader compatibility.
  return pdf.save({ useObjectStreams: false });
}

/** Checks the file before it is stored (WRITER §32 step 5): it parses and has pages. */
export async function validatePdf(bytes: Uint8Array): Promise<boolean> {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return false;
  }

  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  return pdf.getPageCount() > 0;
}
