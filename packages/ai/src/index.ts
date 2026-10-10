/**
 * Aila AI (AI-GATEWAY §36): the one AI interface for all six products.
 * Server only: it reads OPENROUTER_API_KEY and writes usage records.
 */
export {
  generate,
  stream,
  type AiCallOptions,
  type AiProduct,
  type AiRequest,
  type AiResult,
  type AiStreamEvent,
  type AiWebSearchOutcome,
} from './gateway';
export { AI_ERROR_CODES, type AiErrorCode, type AiUsage } from './errors';
export { AI_USAGE_LIMITS, AI_WEB_SEARCH_LIMITS, type AiPlan, type AiUsageLimits } from './policies';
