import { createHash } from 'node:crypto';
import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRateLimitEnv } from './env';

/**
 * Rate limiting for authentication endpoints, account creation, password
 * recovery and email verification (SECURITY-ARCHITECTURE §6.1, §26-27,
 * PLATFORM-FOUNDATION §39, ACCEPTANCE-CRITERIA AC-182), stored in Upstash
 * Redis (AILA-V1-ARCHITECTURE §25).
 *
 * Neon Auth does not document configurable rate limits and does not
 * receive the end user's IP address from this app's server, so limits are
 * enforced here, before any request reaches Neon Auth.
 *
 * Auth fails safely (§25): if Redis is not configured, unreachable or slow,
 * the request is refused rather than allowed.
 */

type Policy = { readonly limit: number; readonly window: Duration };

export const AUTH_RATE_LIMITS = {
  signInPerIp: { limit: 20, window: '10 m' },
  signInPerAccount: { limit: 5, window: '10 m' },
  signUpPerIp: { limit: 5, window: '1 h' },
  verifyPerAccount: { limit: 5, window: '10 m' },
  verificationEmailPerAccount: { limit: 3, window: '10 m' },
  verificationEmailPerIp: { limit: 10, window: '1 h' },
  resetRequestPerAccount: { limit: 3, window: '1 h' },
  resetRequestPerIp: { limit: 10, window: '1 h' },
  resetSubmitPerIp: { limit: 10, window: '1 h' },
  socialSignInPerIp: { limit: 20, window: '10 m' },
  authApiPerIp: { limit: 60, window: '1 m' },
} as const satisfies Record<string, Policy>;

export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMITS;

const REDIS_TIMEOUT_MS = 3000;

let redis: Redis | undefined;
const limiters = new Map<AuthRateLimitName, Ratelimit>();

function getLimiter(name: AuthRateLimitName): Ratelimit {
  let limiter = limiters.get(name);

  if (!limiter) {
    if (!redis) {
      const { url, token } = getRateLimitEnv();
      redis = new Redis({ url, token });
    }

    const policy = AUTH_RATE_LIMITS[name];

    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
      prefix: `aila:auth:${name}`,
      analytics: false,
      // Disable the library's fail-open timeout; we fail closed below.
      timeout: 0,
    });
    limiters.set(name, limiter);
  }

  return limiter;
}

/** Hash identifiers so emails and IP addresses are not stored in Redis. */
function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type RateLimitCheck = readonly [AuthRateLimitName, string];

/**
 * Returns true when every check is within its limit. Any configuration or
 * Redis failure returns false (fail closed).
 */
export async function withinAuthRateLimits(
  checks: readonly RateLimitCheck[],
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const results = await Promise.race([
      Promise.all(
        checks.map(([name, identifier]) =>
          getLimiter(name).limit(hashKey(identifier.toLowerCase())),
        ),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Rate limit check timed out')),
          REDIS_TIMEOUT_MS,
        );
      }),
    ]);

    return results.every((result) => result.success);
  } catch (error) {
    console.error('[auth] Rate limiting unavailable; request refused', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Client IP as set by the hosting platform (Vercel overwrites
 * x-forwarded-for at its edge). Used only as a hashed rate-limit key.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
