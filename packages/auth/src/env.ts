/**
 * Server-only authentication configuration (APPLICATION-ARCHITECTURE §33-34,
 * SECURITY-ARCHITECTURE §2.5). Values are read when first used at runtime,
 * never at build time and never with a NEXT_PUBLIC_ prefix.
 */

export type AuthEnv = {
  readonly baseUrl: string;
  readonly cookieSecret: string;
};

export type RateLimitEnv = {
  readonly url: string;
  readonly token: string;
};

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function httpsUrl(name: string): string {
  const value = required(name);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use https`);
  }

  return value.replace(/\/+$/, '');
}

export function getAuthEnv(): AuthEnv {
  const baseUrl = httpsUrl('NEON_AUTH_BASE_URL');
  const cookieSecret = required('NEON_AUTH_COOKIE_SECRET');

  if (cookieSecret.length < 32) {
    throw new Error('NEON_AUTH_COOKIE_SECRET must contain at least 32 characters');
  }

  return { baseUrl, cookieSecret };
}

export function getRateLimitEnv(): RateLimitEnv {
  return {
    url: httpsUrl('UPSTASH_REDIS_REST_URL'),
    token: required('UPSTASH_REDIS_REST_TOKEN'),
  };
}
