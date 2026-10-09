import type { AiCapability } from '@aila/validation';
import type { AiOperation } from './policies';

/**
 * Server-side model policy (AI-GATEWAY §6-8, §26). Products ask for a
 * capability; only this table names provider models. Fallbacks use a
 * different model family and are enabled only where quality allows.
 * Model IDs were checked against OpenRouter's model list on 2026-10-09.
 */

export type ModelPolicy = {
  readonly primary: string;
  readonly fallbacks: readonly string[];
  readonly operation: AiOperation;
  /** An extra entitlement needed for this capability. */
  readonly entitlement: 'advanced_models' | null;
};

export const MODEL_POLICY: Readonly<Record<AiCapability, ModelPolicy>> = {
  fast: {
    primary: 'google/gemini-3.8-flash',
    fallbacks: ['deepseek/deepseek-chat-v3.1'],
    operation: 'short_generation',
    entitlement: null,
  },
  balanced: {
    primary: 'deepseek/deepseek-chat-v3.1',
    fallbacks: ['google/gemini-3.8-flash'],
    operation: 'short_generation',
    entitlement: null,
  },
  reasoning: {
    primary: 'deepseek/deepseek-r1',
    fallbacks: [],
    operation: 'long_reasoning',
    entitlement: 'advanced_models',
  },
  coding: {
    primary: 'qwen/qwen3-coder',
    fallbacks: [],
    operation: 'short_generation',
    entitlement: null,
  },
  long_context: {
    primary: 'google/gemini-3.8-flash',
    fallbacks: [],
    operation: 'document_analysis',
    entitlement: null,
  },
};

/** Models to try in order for a capability: the primary, then any fallbacks. */
export function modelsFor(capability: AiCapability): readonly string[] {
  const policy = MODEL_POLICY[capability];
  return [policy.primary, ...policy.fallbacks];
}
