import type { AiMessage } from '@aila/validation';
import type { AiUsage } from '../errors';

/**
 * The internal provider adapter contract (AI-GATEWAY §34-35). Adapters
 * throw only AiError (or the abort reason when `signal` aborts), so no
 * provider-specific detail reaches the gateway or product code.
 */

export type ProviderRequest = {
  /** Models to use in order; more than one enables provider-side fallback. */
  readonly models: readonly string[];
  readonly messages: readonly AiMessage[];
  readonly maxOutputTokens: number;
  readonly signal: AbortSignal;
};

export type ProviderResult = {
  readonly content: string;
  /** The model that actually answered. */
  readonly model: string;
  readonly finishReason: string | null;
  readonly usage: AiUsage;
};

export type ProviderStreamEvent =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'done';
      readonly model: string | null;
      readonly finishReason: string | null;
      readonly usage: AiUsage | null;
    };

export type ProviderAdapter = {
  readonly name: string;
  generate(request: ProviderRequest): Promise<ProviderResult>;
  /** Resolves once the provider accepted the request; then yields events. */
  stream(request: ProviderRequest): Promise<AsyncIterable<ProviderStreamEvent>>;
};
