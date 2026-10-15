import Markdown, { type Components } from 'react-markdown';

/**
 * AI replies as Markdown (SECURITY-ARCHITECTURE §12). Raw HTML is never
 * rendered, images are not loaded, and links pass react-markdown's URL
 * check, which drops script and other unsafe protocols. No inline styles.
 */
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
};

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="aila-prose">
      <Markdown skipHtml disallowedElements={['img']} unwrapDisallowed components={components}>
        {text}
      </Markdown>
    </div>
  );
}
