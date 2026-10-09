import { z } from 'zod';

/**
 * AI request input (AI-GATEWAY §6-7, §16). Products ask for a capability,
 * never for a model; the gateway resolves the model on the server.
 */

export const AI_CAPABILITIES = [
  'fast',
  'balanced',
  'reasoning',
  'coding',
  'long_context',
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export const AI_MESSAGE_ROLES = ['system', 'user', 'assistant'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** Most messages in one request (conversation history included). */
export const AI_MAX_MESSAGES = 100;
/** Longest single message. The total per capability is checked by the gateway. */
export const AI_MAX_MESSAGE_CHARS = 1_000_000;

export const aiMessageSchema = z
  .object({
    role: z.enum(AI_MESSAGE_ROLES),
    content: z
      .string()
      .max(AI_MAX_MESSAGE_CHARS)
      .refine((value) => value.trim().length > 0, { error: 'Message is empty.' }),
  })
  .strict();

export type AiMessage = z.infer<typeof aiMessageSchema>;

/** A conversation to send: it must end with the user's message. */
export const aiMessagesSchema = z
  .array(aiMessageSchema)
  .min(1)
  .max(AI_MAX_MESSAGES)
  .refine((messages) => messages.at(-1)?.role === 'user', {
    error: 'The last message must come from the user.',
  });
