import mammoth from 'mammoth';
import { getDocumentProxy } from 'unpdf';

/**
 * Text extraction for AI context (AILA-V1-SCOPE §7, §17). Runs in memory
 * for one request: extracted text is never stored. Every result is capped,
 * and a PDF stops being read once the cap is reached.
 */

export const PDF_TYPE = 'application/pdf';
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PLAIN_TEXT_TYPES: readonly string[] = ['text/plain', 'text/csv'];

/** Types whose text can be extracted. */
export const DOCUMENT_TYPES: readonly string[] = [...PLAIN_TEXT_TYPES, PDF_TYPE, DOCX_TYPE];

/** Most pages read from one PDF. */
export const PDF_MAX_PAGES = 500;

export type ExtractedText = {
  readonly text: string;
  /** True when the document had more text than was kept. */
  readonly truncated: boolean;
};

/** Text without control characters other than tabs and line breaks, with blank runs collapsed. */
export function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** At most `maxChars` characters, never ending inside a surrogate pair. */
export function capText(value: string, maxChars: number): ExtractedText {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  let end = Math.max(0, maxChars);
  const code = value.charCodeAt(end - 1);

  if (code >= 0xd800 && code <= 0xdbff) {
    end -= 1;
  }

  return { text: value.slice(0, end), truncated: true };
}

async function pdfText(bytes: Uint8Array, maxChars: number): Promise<ExtractedText> {
  const pdf = await getDocumentProxy(bytes, { disableFontFace: true });

  try {
    const pages = Math.min(pdf.numPages, PDF_MAX_PAGES);
    const parts: string[] = [];
    let length = 0;

    for (let number = 1; number <= pages && length <= maxChars; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
        .join('');
      page.cleanup();
      parts.push(text);
      length += text.length + 2;
    }

    const capped = capText(normalizeText(parts.join('\n\n')), maxChars);
    return { text: capped.text, truncated: capped.truncated || pdf.numPages > pages };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

async function docxText(bytes: Uint8Array, maxChars: number): Promise<ExtractedText> {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  return capText(normalizeText(result.value), maxChars);
}

/**
 * The text of a document, capped at `maxChars`. Throws when the document
 * cannot be read (damaged, encrypted, or not a document type).
 */
export async function extractText(
  mimeType: string,
  bytes: Uint8Array,
  maxChars: number,
): Promise<ExtractedText> {
  if (PLAIN_TEXT_TYPES.includes(mimeType)) {
    // A character cut off at the end of a partial read is dropped, not replaced.
    return capText(normalizeText(new TextDecoder('utf-8').decode(bytes, { stream: true })), maxChars);
  }

  if (mimeType === PDF_TYPE) {
    return pdfText(bytes, maxChars);
  }

  if (mimeType === DOCX_TYPE) {
    return docxText(bytes, maxChars);
  }

  throw new Error('Unsupported document type');
}
