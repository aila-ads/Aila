/**
 * Web sources shown under an AI reply (SECURITY-ARCHITECTURE §12). Sources
 * come from a web search, so every value is untrusted: only http and https
 * links without credentials are kept, titles are plain text of limited
 * length, and duplicates are removed. Used by the AI gateway when it reads
 * the provider's citations, by the server when it loads stored messages,
 * and by the browser before it renders a link.
 */

export type WebSource = {
  readonly url: string;
  readonly title: string;
  /** Host name without "www.", shown next to the title. */
  readonly domain: string;
};

/** Most sources kept for one reply. */
export const MAX_WEB_SOURCES = 10;
export const MAX_SOURCE_URL_CHARS = 2_048;
export const MAX_SOURCE_TITLE_CHARS = 200;

/** The URL as a safe link, or null: http(s) only, no user name or password. */
export function safeSourceUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SOURCE_URL_CHARS) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname) {
    return null;
  }

  return url;
}

function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One source from untrusted input, or null when it is not safe to show. */
export function toWebSource(url: unknown, title: unknown): WebSource | null {
  const parsed = safeSourceUrl(url);

  if (!parsed) {
    return null;
  }

  const domain = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  let text = typeof title === 'string' ? cleanText(title) : '';

  if (text.length > MAX_SOURCE_TITLE_CHARS) {
    text = `${text.slice(0, MAX_SOURCE_TITLE_CHARS - 1).trimEnd()}…`;
  }

  return { url: parsed.href, title: text || domain, domain };
}

/** Safe, de-duplicated sources in their original order, at most MAX_WEB_SOURCES. */
export function sanitizeWebSources(values: unknown): WebSource[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const sources: WebSource[] = [];

  for (const value of values) {
    if (sources.length >= MAX_WEB_SOURCES) {
      break;
    }

    if (typeof value !== 'object' || value === null) {
      continue;
    }

    const source = toWebSource(Reflect.get(value, 'url'), Reflect.get(value, 'title'));

    if (source && !seen.has(source.url)) {
      seen.add(source.url);
      sources.push(source);
    }
  }

  return sources;
}

/**
 * Sources from OpenRouter `url_citation` annotations
 * (`{ type: 'url_citation', url_citation: { url, title, content } }`).
 * Page excerpts are dropped: only the link and title are kept.
 */
export function sourcesFromAnnotations(annotations: unknown): WebSource[] {
  if (!Array.isArray(annotations)) {
    return [];
  }

  return sanitizeWebSources(
    annotations.flatMap((annotation: unknown) => {
      if (typeof annotation !== 'object' || annotation === null || Reflect.get(annotation, 'type') !== 'url_citation') {
        return [];
      }

      const citation: unknown = Reflect.get(annotation, 'url_citation');
      return typeof citation === 'object' && citation !== null
        ? [{ url: Reflect.get(citation, 'url'), title: Reflect.get(citation, 'title') }]
        : [];
    }),
  );
}
