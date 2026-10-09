import { describe, expect, it } from 'vitest';
import {
  conversationIdSchema,
  renameConversationSchema,
  sendMessageSchema,
  titleFromPrompt,
} from '../../../packages/validation/src/intelligence';

const KEY = '0b4f2a52-6c1e-4d4b-9a3e-2f1d6c7b8a90';

describe('sendMessageSchema', () => {
  it('accepts a message and defaults to no files', () => {
    const parsed = sendMessageSchema.parse({ content: 'Plan my week', capability: 'balanced', requestKey: KEY });
    expect(parsed.fileIds).toEqual([]);
  });

  it.each([
    ['an empty message', { content: '   ' }],
    ['a message over 20,000 characters', { content: 'a'.repeat(20_001) }],
    ['a capability products cannot choose', { capability: 'coding' }],
    ['a model name', { model: 'openai/gpt' }],
    ['an account id', { accountId: 'acct_2' }],
    ['more than three files', { fileIds: ['a', 'b', 'c', 'd'] }],
    ['a bad file id', { fileIds: ['../x'] }],
    ['a bad conversation id', { conversationId: 'x; drop' }],
    ['a request key that is not a UUID', { requestKey: 'abc' }],
  ])('rejects %s', (_, override) => {
    const input = { content: 'Hello', capability: 'fast', requestKey: KEY, ...override };
    expect(sendMessageSchema.safeParse(input).success).toBe(false);
  });
});

describe('renameConversationSchema', () => {
  it('cleans control characters and spaces', () => {
    expect(renameConversationSchema.parse({ conversationId: 'c1', title: '  Q4\u0000  plan\n' }).title).toBe('Q4 plan');
  });

  it('rejects empty and long titles', () => {
    expect(renameConversationSchema.safeParse({ conversationId: 'c1', title: ' \n ' }).success).toBe(false);
    expect(renameConversationSchema.safeParse({ conversationId: 'c1', title: 'a'.repeat(121) }).success).toBe(false);
  });
});

describe('conversationIdSchema', () => {
  it('rejects unexpected keys', () => {
    expect(conversationIdSchema.safeParse({ conversationId: 'c1', accountId: 'a' }).success).toBe(false);
  });
});

describe('titleFromPrompt', () => {
  it('uses the first non-empty line, shortened to 80 characters', () => {
    expect(titleFromPrompt('\n  Draft a launch plan  \nmore')).toBe('Draft a launch plan');
    const title = titleFromPrompt('word '.repeat(40));
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });
});
