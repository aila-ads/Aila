import { getAuth } from './server';
import { AUTH_MESSAGES } from './messages';
import {
  clientIpFrom,
  withinRateLimits,
  type RateLimitCheck,
} from './rate-limit';

/**
 * Route handlers for app/api/auth/[...path]: the same-origin proxy to Neon
 * Auth (an authentication Route Handler, APPLICATION-ARCHITECTURE §12).
 * Every state-changing request is rate limited by client IP before it is
 * forwarded (SECURITY-ARCHITECTURE §6.1, §26).
 */

type RouteContext = { params: Promise<{ path: string[] }> };

type Handlers = ReturnType<ReturnType<typeof getAuth>['handler']>;

let handlers: Handlers | undefined;

function getHandlers(): Handlers {
  handlers ??= getAuth().handler();
  return handlers;
}

const PATH_LIMITS: Record<string, RateLimitCheck[0]> = {
  'sign-in/email': 'signInPerIp',
  'sign-in/social': 'socialSignInPerIp',
  'sign-up/email': 'signUpPerIp',
  'request-password-reset': 'resetRequestPerIp',
  'reset-password': 'resetSubmitPerIp',
  'send-verification-email': 'verificationEmailPerIp',
  'email-otp/send-verification-otp': 'verificationEmailPerIp',
};

export async function GET(request: Request, context: RouteContext) {
  return getHandlers().GET(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  const path = (await context.params).path.join('/');
  const ip = clientIpFrom(request.headers);
  const checks: RateLimitCheck[] = [['authApiPerIp', ip]];
  const pathLimit = PATH_LIMITS[path];

  if (pathLimit) {
    checks.push([pathLimit, ip]);
  }

  if (!(await withinRateLimits(checks))) {
    return Response.json(
      { message: AUTH_MESSAGES.rateLimited, code: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  return getHandlers().POST(request, context);
}
