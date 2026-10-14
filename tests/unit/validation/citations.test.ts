import { describe, expect, it } from 'vitest';
import {
  MAX_WEB_SOURCES,
  safeSourceUrl,
  sanitizeWebSources,
  sourcesFromAnnotations,
  toWebSource,
} from '../../../packages/validation/src/citations';

describe('web source sanitizing', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'mailto:a@example.com',
    'https://user:pass@example.com/',
    '//example.com/no-scheme',
    'not a url',
    '',
    `https://example.com/${'a'.repeat(2_100)}`,
    42,
    null,
  ])('rejects %j', (url) => {
    expect(safeSourceUrl(url)).toBeNull();
    expect(toWebSource(url, 'Title')).toBeNull();
  });

  it('keeps http and https links with a clean title and domain', () => {
    expect(toWebSource('https://www.BBC.com/news/world?x=1#top', '  BBC\u0000 News \u202e\n World  ')).toEqual({
      url: 'https://www.bbc.com/news/world?x=1#top',
      title: 'BBC News World',
      domain: 'bbc.com',
    });
    expect(toWebSource('http://example.org', undefined)).toEqual({
      url: 'http://example.org/',
      title: 'example.org',
      domain: 'example.org',
    });
  });

  it('shortens long titles', () => {
    const source = toWebSource('https://example.com', 'x'.repeat(500))!;
    expect(source.title.length).toBe(200);
    expect(source.title.endsWith('…')).toBe(true);
  });

  it('removes duplicates and unsafe entries and caps the list', () => {
    const many = Array.from({ length: 15 }, (_, index) => ({ url: `https://example.com/${index}`, title: `${index}` }));
    expect(sanitizeWebSources(many)).toHaveLength(MAX_WEB_SOURCES);
    expect(
      sanitizeWebSources([
        { url: 'https://a.example/', title: 'A' },
        { url: 'https://a.example/', title: 'A again' },
        { url: 'javascript:void(0)', title: 'Bad' },
        'https://b.example/',
        null,
      ]),
    ).toEqual([{ url: 'https://a.example/', title: 'A', domain: 'a.example' }]);
    expect(sanitizeWebSources('nope')).toEqual([]);
  });

  it('reads only url_citation annotations and drops the page content', () => {
    const sources = sourcesFromAnnotations([
      { type: 'url_citation', url_citation: { url: 'https://a.example/x', title: 'A', content: 'secret excerpt' } },
      { type: 'url_citation', url_citation: null },
      { type: 'url_citation' },
      { type: 'other', url_citation: { url: 'https://c.example/' } },
    ]);
    expect(sources).toEqual([{ url: 'https://a.example/x', title: 'A', domain: 'a.example' }]);
    expect(JSON.stringify(sources)).not.toContain('secret');
    expect(sourcesFromAnnotations(undefined)).toEqual([]);
  });
});
