/**
 * Content Security Policy (SECURITY-ARCHITECTURE §13–14). Every source
 * beyond 'self' has a reason:
 *
 * - script-src: a per-request nonce that Next.js puts on its own scripts;
 *   'strict-dynamic' lets those scripts load the app's code chunks. No
 *   'unsafe-inline' and, outside `next dev`, no 'unsafe-eval'.
 * - img-src data: the paper-grain texture is an inline SVG in globals.css.
 * - connect-src storage origin: the browser uploads files straight to the
 *   storage bucket with presigned PUT URLs. Downloads are navigations and
 *   need no entry. Auth, tRPC and AI streaming are same-origin.
 */
export function contentSecurityPolicy({
  nonce,
  storageEndpoint,
  development,
}: {
  nonce: string;
  storageEndpoint?: string;
  development: boolean;
}): string {
  const connectSrc = ["'self'"];

  if (storageEndpoint) {
    connectSrc.push(new URL(storageEndpoint).origin);
  }

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];

  // React needs eval for its development-only debugging features.
  if (development) {
    scriptSrc.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
