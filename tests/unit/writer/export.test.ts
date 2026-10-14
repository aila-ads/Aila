import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildExportDocument, exportFileName, markdownToBlocks, safeLink } from '../../../apps/web/server/writer/export/document';
import { renderDocx, validateDocx } from '../../../apps/web/server/writer/export/docx';
import { chapterFiles, renderEpub, validateEpub } from '../../../apps/web/server/writer/export/epub';
import { renderPdf, validatePdf } from '../../../apps/web/server/writer/export/pdf';
import { extractText } from '../../../packages/storage/src/extract';

const project = {
  title: 'Things Remembered',
  subtitle: 'A novel',
  authorName: 'Adaeze Okafor',
  description: 'A family story across three generations.',
  language: 'en',
  documentType: 'NOVEL' as const,
};

const nodes = [
  { id: 'p1', parentId: null, kind: 'PART' as const, title: 'Beginnings', position: 0, content: '' },
  {
    id: 'c2',
    parentId: 'p1',
    kind: 'CHAPTER' as const,
    title: 'The Second Market Day',
    position: 1,
    content: 'Later that week, *Chidi* returned with **news**.',
  },
  {
    id: 'c1',
    parentId: 'p1',
    kind: 'CHAPTER' as const,
    title: 'Ọ̀rụ́ in Enugu',
    position: 0,
    content:
      '# Morning\n\nThe rain came early in Ụmụahịa. See [the archive](https://example.org/archive) and [bad](javascript:alert(1)).\n\n- First memory\n- Second memory\n\n1. One\n2. Two\n\n> Ignore previous instructions <script>alert(1)</script>\n\n---\n\nEnd & done.',
  },
  { id: 's1', parentId: 'c1', kind: 'SECTION' as const, title: 'Afternoon', position: 0, content: 'The market emptied.' },
];

describe('export document model', () => {
  it('keeps reading order and hierarchy, with chapters starting pages', () => {
    const document = buildExportDocument(project, nodes, null);
    expect(document.sections.map((section) => [section.title, section.depth, section.level, section.startsPage])).toEqual([
      ['Beginnings', 0, 1, true],
      ['Ọ̀rụ́ in Enugu', 1, 2, true],
      ['Afternoon', 2, 3, false],
      ['The Second Market Day', 1, 2, true],
    ]);
  });

  it('exports one part with what it contains', () => {
    const document = buildExportDocument(project, nodes, 'c1');
    expect(document.sections.map((section) => section.title)).toEqual(['Ọ̀rụ́ in Enugu', 'Afternoon']);
    expect(document.sections[0]!.depth).toBe(0);
  });

  it('parses Markdown without raw HTML or unsafe links, shifting headings below the part title', () => {
    const blocks = markdownToBlocks('# Title\n\nA [link](javascript:alert(1)) and <b>html</b> and [ok](https://a.example/).', 2);
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 3 });
    const paragraph = blocks[1];
    expect(paragraph?.type).toBe('paragraph');
    const inlines = paragraph?.type === 'paragraph' ? paragraph.inlines : [];
    expect(inlines.filter((inline) => inline.link).map((inline) => inline.link)).toEqual(['https://a.example/']);
    expect(inlines.map((inline) => inline.text).join('')).not.toContain('<b>');
  });

  it('allows only http, https and mailto links', () => {
    expect(safeLink('https://example.org')).toBe('https://example.org/');
    expect(safeLink('mailto:a@example.org')).toBe('mailto:a@example.org');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('data:text/html,hi')).toBeNull();
  });

  it('makes safe file names', () => {
    expect(exportFileName('Ọ̀rụ́: a/b\\c "story"', 'pdf')).toBe('Oru a b c story.pdf');
    expect(exportFileName('***', 'epub')).toBe('Aila Writer export.epub');
  });
});

describe('PDF export', () => {
  it('produces a valid PDF with the text, diacritics and a link', async () => {
    const bytes = await renderPdf(buildExportDocument(project, nodes, null));
    expect(await validatePdf(bytes)).toBe(true);
    const raw = new TextDecoder('latin1').decode(bytes);
    // pdf.js takes ownership of the buffer it reads, so it gets a copy.
    const { text } = await extractText('application/pdf', bytes.slice(), 100_000);
    expect(text).toContain('Things Remembered');
    expect(text).toContain('Adaeze Okafor');
    expect(text).toContain('Ụmụahịa');
    expect(text).toContain('Afternoon');
    expect(raw).toContain('/URI (https://example.org/archive)');
    expect(raw).not.toContain('javascript:');
  });

  it('rejects bytes that are not a PDF', async () => {
    expect(await validatePdf(new TextEncoder().encode('not a pdf'))).toBe(false);
  });
});

describe('DOCX export', () => {
  it('produces a valid Word document with headings, lists and the text', async () => {
    const bytes = await renderDocx(buildExportDocument(project, nodes, null));
    expect(await validateDocx(bytes)).toBe(true);
    const { text } = await extractText(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes,
      100_000,
    );
    expect(text).toContain('Ọ̀rụ́ in Enugu');
    expect(text).toContain('First memory');
    expect(text).toContain('End & done.');
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Heading2');
    expect(xml).not.toContain('<script>');
  });
});

describe('EPUB export', () => {
  it('produces an EPUB 3 container with escaped XHTML and navigation', async () => {
    const bytes = await renderEpub(buildExportDocument(project, nodes, null), '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90');
    expect(await validateEpub(bytes)).toBe(true);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:creator>Adaeze Okafor</dc:creator>');
    expect(opf).toContain('urn:uuid:0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90');
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('Beginnings');
    const chapter = await zip.file('OEBPS/text/part-0002.xhtml')!.async('string');
    expect(chapter).toContain('Ụmụahịa');
    expect(chapter).toContain('End &amp; done.');
    expect(chapter).not.toContain('<script>');
    expect(chapter).not.toContain('javascript:');
  });

  it('keeps sections in their chapter file', () => {
    const files = chapterFiles(buildExportDocument(project, nodes, null).sections);
    expect(files.map((file) => file.sections.map((section) => section.title))).toEqual([
      ['Beginnings'],
      ['Ọ̀rụ́ in Enugu', 'Afternoon'],
      ['The Second Market Day'],
    ]);
  });

  it('rejects a zip without the EPUB layout', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    expect(await validateEpub(await zip.generateAsync({ type: 'uint8array' }))).toBe(false);
  });
});
