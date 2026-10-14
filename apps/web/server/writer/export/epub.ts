import JSZip from 'jszip';
import { WRITER_NODE_KIND_LABELS } from '@aila/validation';
import type { Block, ExportDocument, ExportSection, Inline } from './document';

/**
 * EPUB 3 (docs/products/WRITER.md §31): one XHTML file per chapter or
 * higher level, a navigation document from the hierarchy, and package
 * metadata (title, author, language, description). Every piece of text is
 * escaped; no scripts, remote resources or raw HTML from the document.
 */

export const EPUB_MIME = 'application/epub+zip';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function inlineXhtml(inlines: readonly Inline[]): string {
  return inlines
    .map((inline) => {
      if (inline.text === '\n') return '<br/>';
      let html = escapeXml(inline.text);
      if (inline.code) html = `<code>${html}</code>`;
      if (inline.italic) html = `<em>${html}</em>`;
      if (inline.bold) html = `<strong>${html}</strong>`;
      if (inline.link) html = `<a href="${escapeXml(inline.link)}">${html}</a>`;
      return html;
    })
    .join('');
}

function blockXhtml(block: Block): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${inlineXhtml(block.inlines)}</h${block.level}>`;
    case 'paragraph':
      return `<p>${inlineXhtml(block.inlines)}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
      return `<${tag}${start}>${block.items.map((item) => `<li>${item.map(blockXhtml).join('')}</li>`).join('')}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${block.blocks.map(blockXhtml).join('')}</blockquote>`;
    case 'code':
      return `<pre><code>${escapeXml(block.text)}</code></pre>`;
    case 'rule':
      return '<hr/>';
  }
}

function xhtmlPage(title: string, language: string, body: string, extraNamespace = ''): string {
  const lang = escapeXml(language);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${extraNamespace} lang="${lang}" xml:lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

const STYLES = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; page-break-after: avoid; }
h1 { text-align: center; margin-top: 2em; }
.title-page { text-align: center; margin-top: 30%; }
.title-page .subtitle { font-style: italic; }
.title-page .author { margin-top: 2em; }
.kind { display: block; font-size: 0.7em; letter-spacing: 0.15em; text-transform: uppercase; }
blockquote { margin: 1em 2em; font-style: italic; }
pre { white-space: pre-wrap; font-family: monospace; font-size: 0.9em; }
hr { border: none; text-align: center; margin: 1.5em 0; }
hr::after { content: "* * *"; }
`;

type Chapter = { readonly file: string; readonly title: string; readonly sections: ExportSection[] };

/** Splits sections into files: each section that starts a page begins a new file. */
export function chapterFiles(sections: readonly ExportSection[]): Chapter[] {
  const files: Chapter[] = [];

  for (const section of sections) {
    const last = files.at(-1);

    if (!last || section.startsPage || section.kind !== 'SECTION') {
      files.push({ file: `text/part-${String(files.length + 1).padStart(4, '0')}.xhtml`, title: section.title, sections: [section] });
    } else {
      last.sections.push(section);
    }
  }

  return files;
}

function sectionXhtml(section: ExportSection): string {
  const kind = section.kind === 'PART' ? `<span class="kind">${WRITER_NODE_KIND_LABELS.PART}</span>` : '';
  return `<section epub:type="${section.kind === 'PART' ? 'part' : section.kind === 'CHAPTER' ? 'chapter' : 'division'}" id="s-${escapeXml(section.id)}">
<h${section.level}>${kind}${escapeXml(section.title)}</h${section.level}>
${section.blocks.map(blockXhtml).join('\n')}
</section>`;
}

/** The nav document: a nested list following the hierarchy. */
function navXhtml(document: ExportDocument, files: readonly Chapter[]): string {
  const entries = files.flatMap((file) =>
    file.sections.map((section) => ({ depth: section.depth, href: `${file.file}#s-${section.id}`, title: section.title })),
  );
  let html = '';
  let depth = -1;

  for (const entry of entries) {
    const target = Math.min(entry.depth, depth + 1);

    if (target > depth) {
      html += '<ol>'.repeat(target - depth);
    } else {
      html += '</li>';
      html += '</ol></li>'.repeat(depth - target);
    }

    html += `<li><a href="${escapeXml(entry.href)}">${escapeXml(entry.title || 'Untitled')}</a>`;
    depth = target;
  }

  if (depth >= 0) {
    html += '</li>' + '</ol></li>'.repeat(depth) + '</ol>';
  } else {
    html = '<ol><li><a href="title.xhtml">Title page</a></li></ol>';
  }

  return xhtmlPage(
    document.title,
    document.language,
    `<nav epub:type="toc" id="toc"><h1>Contents</h1>${html}</nav>`,
  );
}

/** Builds the EPUB container. `identifier` must be unique per export. */
export async function renderEpub(document: ExportDocument, identifier: string, now: Date = new Date()): Promise<Uint8Array> {
  const zip = new JSZip();
  // The mimetype entry must come first and be stored uncompressed.
  zip.file('mimetype', EPUB_MIME, { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
  );

  const files = chapterFiles(document.sections);
  const titlePage = xhtmlPage(
    document.title,
    document.language,
    `<section class="title-page" epub:type="titlepage">
<h1>${escapeXml(document.title)}</h1>
${document.subtitle ? `<p class="subtitle">${escapeXml(document.subtitle)}</p>` : ''}
${document.author ? `<p class="author">${escapeXml(document.author)}</p>` : ''}
</section>`,
  );

  zip.file('OEBPS/styles.css', STYLES);
  zip.file('OEBPS/title.xhtml', titlePage);
  zip.file('OEBPS/nav.xhtml', navXhtml(document, files));

  for (const file of files) {
    zip.file(
      `OEBPS/${file.file}`,
      xhtmlPage(file.title, document.language, file.sections.map(sectionXhtml).join('\n')).replace(
        'href="styles.css"',
        'href="../styles.css"',
      ),
    );
  }

  const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="styles.css" media-type="text/css"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...files.map((file, index) => `<item id="c${index + 1}" href="${file.file}" media-type="application/xhtml+xml"/>`),
  ];
  const spine = ['<itemref idref="title"/>', '<itemref idref="nav"/>', ...files.map((_, index) => `<itemref idref="c${index + 1}"/>`)];

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(document.language)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">urn:uuid:${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(document.title)}</dc:title>
<dc:language>${escapeXml(document.language)}</dc:language>
${document.author ? `<dc:creator>${escapeXml(document.author)}</dc:creator>` : ''}
${document.description ? `<dc:description>${escapeXml(document.description)}</dc:description>` : ''}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>
`,
  );

  return zip.generateAsync({ type: 'uint8array', mimeType: EPUB_MIME, compression: 'DEFLATE' });
}

/** Checks the container before it is stored (WRITER §32 step 5). */
export async function validateEpub(bytes: Uint8Array): Promise<boolean> {
  // The first local file header must be the stored "mimetype" entry.
  const header = new TextDecoder().decode(bytes.slice(30, 38));
  const mimetype = new TextDecoder().decode(bytes.slice(38, 38 + EPUB_MIME.length));

  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || header !== 'mimetype' || mimetype !== EPUB_MIME) {
    return false;
  }

  const zip = await JSZip.loadAsync(bytes);
  return Boolean(zip.file('META-INF/container.xml') && zip.file('OEBPS/content.opf') && zip.file('OEBPS/nav.xhtml'));
}
