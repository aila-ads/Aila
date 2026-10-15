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
  // Chosen by the gateway when a request carries images; never by products directly.
  'vision',
  // Speech to text for voice input; usage is recorded with this operation.
  'transcribe',
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export const AI_MESSAGE_ROLES = ['system', 'user', 'assistant'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** Most messages in one request (conversation history included). */
export const AI_MAX_MESSAGES = 100;
/** Longest single message. The total per capability is checked by the gateway. */
export const AI_MAX_MESSAGE_CHARS = 1_000_000;

/** Image types that can be sent to the AI inline. */
export const AI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Largest inline image, as a base64 data URL (about 8 MB of image data). */
export const AI_MAX_IMAGE_URL_CHARS = 11_200_000;
/** Largest inline audio clip, base64 (about 4 MB of audio). */
export const AI_MAX_AUDIO_CHARS = 5_600_000;
/** Most content parts in one message. */
export const AI_MAX_PARTS = 8;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const nonEmpty = (value: string) => value.trim().length > 0;

export const aiContentPartSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('text'),
    text: z.string().max(AI_MAX_MESSAGE_CHARS).refine(nonEmpty, { error: 'Message is empty.' }),
  }),
  z.strictObject({
    type: z.literal('image_url'),
    image_url: z.strictObject({
      url: z.string().max(AI_MAX_IMAGE_URL_CHARS).regex(IMAGE_DATA_URL),
    }),
  }),
  z.strictObject({
    type: z.literal('input_audio'),
    input_audio: z.strictObject({
      data: z.string().min(1).max(AI_MAX_AUDIO_CHARS).regex(BASE64),
      format: z.literal('wav'),
    }),
  }),
]);

export type AiContentPart = z.infer<typeof aiContentPartSchema>;

const textContent = z
  .string()
  .max(AI_MAX_MESSAGE_CHARS)
  .refine(nonEmpty, { error: 'Message is empty.' });

/**
 * One message. System and assistant messages are text; a user message may
 * also carry images or audio as content parts, with at least one text part.
 */
export const aiMessageSchema = z.union([
  z.strictObject({ role: z.enum(AI_MESSAGE_ROLES), content: textContent }),
  z.strictObject({
    role: z.literal('user'),
    content: z
      .array(aiContentPartSchema)
      .min(1)
      .max(AI_MAX_PARTS)
      .refine((parts) => parts.some((part) => part.type === 'text'), {
        error: 'Message is empty.',
      }),
  }),
]);

export type AiMessage = z.infer<typeof aiMessageSchema>;

/** The text of a message, without images or audio. */
export function aiMessageText(message: AiMessage): string {
  return typeof message.content === 'string'
    ? message.content
    : message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

/** Counts of non-text parts in a message. */
export function aiMessageMedia(message: AiMessage): { readonly images: number; readonly audio: number } {
  if (typeof message.content === 'string') {
    return { images: 0, audio: 0 };
  }

  return {
    images: message.content.filter((part) => part.type === 'image_url').length,
    audio: message.content.filter((part) => part.type === 'input_audio').length,
  };
}

/** A conversation to send: it must end with the user's message. */
export const aiMessagesSchema = z
  .array(aiMessageSchema)
  .min(1)
  .max(AI_MAX_MESSAGES)
  .refine((messages) => messages.at(-1)?.role === 'user', {
    error: 'The last message must come from the user.',
  });
