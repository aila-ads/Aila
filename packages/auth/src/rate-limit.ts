import { createHash } from 'node:crypto';
import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRateLimitEnv } from './env';

/**
 * Rate limiting (SECURITY-ARCHITECTURE §6.1, §10, §26-27,
 * PLATFORM-FOUNDATION §39, ACCEPTANCE-CRITERIA AC-182), stored in Upstash
 * Redis (AILA-V1-ARCHITECTURE §25). All limits live in this one table
 * (APPLICATION-ARCHITECTURE §33).
 *
 * Authentication limits are enforced here, before any request reaches Neon
 * Auth, because Neon Auth does not document configurable rate limits and
 * does not receive the end user's IP address from this app's server.
 *
 * Limits fail safely: if Redis is not configured, unreachable or slow, the
 * request is refused rather than allowed.
 */

type Policy = {
  readonly scope: 'auth' | 'api';
  readonly limit: number;
  readonly window: Duration;
};

export const RATE_LIMITS = {
  signInPerIp: { scope: 'auth', limit: 20, window: '10 m' },
  signInPerAccount: { scope: 'auth', limit: 5, window: '10 m' },
  signUpPerIp: { scope: 'auth', limit: 5, window: '1 h' },
  verifyPerAccount: { scope: 'auth', limit: 5, window: '10 m' },
  verificationEmailPerAccount: { scope: 'auth', limit: 3, window: '10 m' },
  verificationEmailPerIp: { scope: 'auth', limit: 10, window: '1 h' },
  resetRequestPerAccount: { scope: 'auth', limit: 3, window: '1 h' },
  resetRequestPerIp: { scope: 'auth', limit: 10, window: '1 h' },
  resetSubmitPerIp: { scope: 'auth', limit: 10, window: '1 h' },
  socialSignInPerIp: { scope: 'auth', limit: 20, window: '10 m' },
  authApiPerIp: { scope: 'auth', limit: 60, window: '1 m' },
  // A signed-in password change checks the current password, so it gets
  // the same limit as sign-in attempts for one account.
  passwordChangePerAccount: { scope: 'auth', limit: 5, window: '10 m' },
  // Application API (tRPC): every request per IP, and writes per account.
  apiPerIp: { scope: 'api', limit: 120, window: '1 m' },
  apiMutationPerAccount: { scope: 'api', limit: 30, window: '1 m' },
  // File uploads per account (AC-182: upload abuse is controlled).
  fileUploadPerAccount: { scope: 'api', limit: 20, window: '10 m' },
  // AI requests per account, a burst limit on top of the trial and Pro
  // usage limits counted in Postgres (AI-GATEWAY §14-15, AC-182).
  aiRequestPerAccount: { scope: 'api', limit: 10, window: '1 m' },
  // Billing actions per account: checkout, payment confirmation and
  // cancellation (SECURITY-ARCHITECTURE §26).
  billingPerAccount: { scope: 'api', limit: 10, window: '10 m' },
} as const satisfies Record<string, Policy>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const REDIS_TIMEOUT_MS = 3000;

let redis: Redis | undefined;
const limiters = new Map<RateLimitName, Ratelimit>();

function getLimiter(name: RateLimitName): Ratelimit {
  let limiter = limiters.get(name);

  if (!limiter) {
    if (!redis) {
      const { url, token } = getRateLimitEnv();
      redis = new Redis({ url, token });
    }

    const policy = RATE_LIMITS[name];

    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
      prefix: `aila:${policy.scope}:${name}`,
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

export type RateLimitCheck = readonly [RateLimitName, string];

/**
 * Returns true when every check is within its limit. Any configuration or
 * Redis failure returns false (fail closed).
 */
export async function withinRateLimits(
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
    console.error('[rate-limit] Rate limiting unavailable; request refused', {
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
