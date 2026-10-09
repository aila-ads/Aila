import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capText, extractText, normalizeText } from '../../../packages/storage/src/extract';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url)));
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('document text extraction', () => {
  it('reads every page of a PDF', async () => {
    const result = await extractText('application/pdf', fixture('two-pages.pdf'), 10_000);
    expect(result.text).toContain('Aila quarterly revenue grew 40 percent');
    expect(result.text).toContain('Second page mentions Lagos office');
    expect(result.truncated).toBe(false);
  });

  it('caps PDF text and marks it truncated', async () => {
    const result = await extractText('application/pdf', fixture('two-pages.pdf'), 20);
    expect(result.text).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  it('reads the text of a DOCX file', async () => {
    const result = await extractText(DOCX, fixture('plan.docx'), 10_000);
    expect(result.text).toContain('Business plan for Aila');
    expect(result.text).toContain('Launch in Nigeria first.');
  });

  it('caps DOCX and plain text', async () => {
    expect(await extractText(DOCX, fixture('plan.docx'), 8)).toEqual({ text: 'Business', truncated: true });
    const csv = new TextEncoder().encode('a,b\n1,2\n3,4\n');
    expect(await extractText('text/csv', csv, 7)).toEqual({ text: 'a,b\n1,2', truncated: true });
  });

  it('fails on damaged documents and unsupported types', async () => {
    await expect(extractText('application/pdf', new TextEncoder().encode('%PDF-1.4 broken'), 100)).rejects.toThrow();
    await expect(extractText(DOCX, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 100)).rejects.toThrow();
    await expect(extractText('image/png', new Uint8Array([1]), 100)).rejects.toThrow();
  });

  it('never splits a character and removes control characters', () => {
    expect(capText('ab😀', 3)).toEqual({ text: 'ab', truncated: true });
    expect(normalizeText('a\u0000b\r\n\n\n\nc  \n')).toBe('ab\n\nc');
  });
});
