export const DEFAULT_REDIRECT_PATH = '/dashboard';

// Any ASCII control character (including tab/newline, which browsers strip
// from URLs) or a backslash (which browsers treat like a forward slash).
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns `value` only if it is a same-site relative path such as
 * `/dashboard` or `/projects?tab=files`. Anything else (absolute URLs,
 * protocol-relative `//host` URLs, `/\host`, `javascript:` URLs, empty
 * values) falls back to `fallback`, preventing open redirects.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT_PATH,
): string {
  if (!value) {
    return fallback;
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  if (UNSAFE_CHARACTERS.test(value)) {
    return fallback;
  }

  // Defence in depth: the path must resolve to the same origin.
  try {
    const base = 'https://aila.invalid';
    if (new URL(value, base).origin !== base) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return value;
}
