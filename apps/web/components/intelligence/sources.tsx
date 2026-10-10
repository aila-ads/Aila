import { safeSourceUrl, type WebSource } from '@aila/validation';

/**
 * Web sources under an Aila reply, numbered to match the [1], [2] markers
 * in the text. Each link is checked again here (http and https only) and
 * opens in a new tab without passing the page or referrer.
 */
export function Sources({ sources }: { sources: readonly WebSource[] }) {
  const safe = sources.filter((source) => safeSourceUrl(source.url) !== null);

  if (safe.length === 0) {
    return null;
  }

  return (
    <section aria-label="Sources" className="grid gap-1 border-t border-brass/40 pt-2">
      <p className="label-caps text-brass-ink">Sources</p>
      <ol className="grid list-decimal gap-1 pl-5 text-sm">
        {safe.map((source) => (
          <li key={source.url} className="break-words">
            <a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className="text-foreground">
              {source.title}
            </a>{' '}
            <span className="text-muted-foreground">{source.domain}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
