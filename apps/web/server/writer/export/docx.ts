import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from 'docx';
import JSZip from 'jszip';
import type { Block, ExportDocument, Inline } from './document';

/**
 * DOCX (docs/products/WRITER.md §31) through the `docx` library: a title
 * page, Word heading styles for the hierarchy (so Word's navigation pane
 * and table of contents work), real Word lists, links, bold, italics, page
 * breaks before chapters and page numbers.
 */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const BULLETS = 'aila-bullets';
const NUMBERS = 'aila-numbers';

function runs(inlines: readonly Inline[], extra: { italics?: boolean } = {}): ParagraphChild[] {
  return inlines.map((inline) => {
    if (inline.text === '\n') {
      return new TextRun({ break: 1 });
    }

    const run = new TextRun({
      text: inline.text,
      bold: inline.bold,
      italics: inline.italic || extra.italics,
      font: inline.code ? 'Courier New' : undefined,
      style: inline.link ? 'Hyperlink' : undefined,
    });
    return inline.link ? new ExternalHyperlink({ link: inline.link, children: [run] }) : run;
  });
}

type ListContext = { readonly reference: string; readonly level: number; readonly instance: number };

class Writer {
  readonly paragraphs: Paragraph[] = [];
  private instance = 0;

  block(block: Block, list: ListContext | null = null, quote = false): void {
    switch (block.type) {
      case 'heading':
        this.paragraphs.push(new Paragraph({ heading: HEADINGS[block.level - 1], children: runs(block.inlines) }));
        return;
      case 'paragraph':
        this.paragraphs.push(
          new Paragraph({
            children: runs(block.inlines, { italics: quote }),
            ...(list ? { numbering: list } : {}),
            ...(quote && !list ? { indent: { left: 720, right: 720 } } : {}),
            spacing: { after: 160 },
          }),
        );
        return;
      case 'list': {
        this.instance += 1;
        const context: ListContext = {
          reference: block.ordered ? NUMBERS : BULLETS,
          level: list ? Math.min(8, list.level + 1) : 0,
          instance: this.instance,
        };

        for (const item of block.items) {
          const [first, ...rest] = item;

          if (first && first.type === 'paragraph') {
            this.block(first, context, quote);
          } else {
            this.paragraphs.push(new Paragraph({ numbering: context, children: [] }));
            if (first) this.block(first, context, quote);
          }

          for (const child of rest) {
            this.block(child, child.type === 'list' ? context : null, quote);
          }
        }
        return;
      }
      case 'quote':
        for (const child of block.blocks) this.block(child, list, true);
        return;
      case 'code':
        for (const line of block.text.split('\n')) {
          this.paragraphs.push(
            new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })], indent: { left: 360 } }),
          );
        }
        return;
      case 'rule':
        this.paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('*   *   *')] }));
        return;
    }
  }
}

const levels = (ordered: boolean) =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3]!,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

export async function renderDocx(document: ExportDocument): Promise<Uint8Array> {
  const writer = new Writer();

  // Title page.
  writer.paragraphs.push(
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 2400 }, children: [new TextRun(document.title)] }),
  );

  if (document.subtitle) {
    writer.paragraphs.push(
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: document.subtitle, italics: true, size: 32 })] }),
    );
  }

  if (document.author) {
    writer.paragraphs.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 960 }, children: [new TextRun({ text: document.author, size: 28 })] }),
    );
  }

  for (const section of document.sections) {
    writer.paragraphs.push(
      new Paragraph({
        heading: HEADINGS[section.level - 1],
        pageBreakBefore: section.startsPage,
        children: [new TextRun(section.title)],
      }),
    );

    for (const block of section.blocks) {
      writer.block(block);
    }
  }

  const doc = new Document({
    creator: document.author ?? 'Aila Writer',
    title: document.title,
    description: document.description ?? undefined,
    styles: {
      default: {
        document: { run: { font: 'Georgia', size: 24 } },
      },
    },
    numbering: {
      config: [
        { reference: BULLETS, levels: levels(false) },
        { reference: NUMBERS, levels: levels(true) },
      ],
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })],
          }),
        },
        children: writer.paragraphs,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}

/** Checks the package before it is stored (WRITER §32 step 5). */
export async function validateDocx(bytes: Uint8Array): Promise<boolean> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return false;
  }

  const zip = await JSZip.loadAsync(bytes);
  const body = await zip.file('word/document.xml')?.async('string');
  return Boolean(zip.file('[Content_Types].xml') && body && body.includes('<w:body>'));
}
