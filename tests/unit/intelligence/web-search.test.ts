import { describe, expect, it } from 'vitest';
import { namedEntities, needsWebSearch, webSearchRequest } from '../../../apps/web/server/intelligence/web-search';

const now = new Date('2026-10-10T08:00:00Z');

describe('Auto web search heuristic', () => {
  it.each([
    'What is the latest news on the Nigerian elections?',
    'whats the dollar rate today',
    'Bitcoin price',
    'who is chinua achebe',
    'who won the Champions League final?',
    'Can you search for the best schools in Abuja',
    'please look it up',
    'What are the new tax rules for 2026?',
    'Plans for 2027 budget',
    'Tell me about Dangote Group',
    'What does Flutterwave Inc do?',
    'what is the official site for the Lagos State government',
    'What happened in Kano yesterday',
    'Is Jumia still operating in Ghana?',
    'Weather forecast for Enugu',
  ])('searches for %j', (prompt) => {
    expect(needsWebSearch(prompt, { now })).toBe(true);
  });

  it.each([
    'Write a poem about the sea',
    'Summarise the attached document in five bullet points',
    'Help me plan my launch week',
    'Translate "good morning" into Igbo',
    'Explain how photosynthesis works',
    'Rewrite this email to sound more formal: Dear Mr Okafor, thanks for the meeting.',
    'what was the main cause of the first world war? keep it short',
    'My history essay is about 1960 independence',
    '   ',
  ])('does not search for %j', (prompt) => {
    expect(needsWebSearch(prompt, { now })).toBe(false);
  });

  it('skips names the conversation already covered', () => {
    expect(needsWebSearch('What else did Grace Adeyemi say?', { now })).toBe(true);
    expect(
      needsWebSearch('What else did Grace Adeyemi say?', { now, context: 'Notes from my call with Grace Adeyemi' }),
    ).toBe(false);
  });

  it('finds multi-word names but not sentence starts or greetings', () => {
    expect(namedEntities('Tell me about Chinua Achebe and Things Fall Apart')).toEqual([
      'Chinua Achebe',
      'Things Fall Apart',
    ]);
    expect(namedEntities('Hello Aila')).toEqual([]);
    expect(namedEntities('What Is This')).toEqual([]);
  });
});

describe('webSearchRequest', () => {
  it('maps the toggle to the gateway setting', () => {
    expect(webSearchRequest('on', 'Write a poem', { now })).toBe('required');
    expect(webSearchRequest('off', 'latest news today', { now })).toBeUndefined();
    expect(webSearchRequest('auto', 'latest news today', { now })).toBe('if_available');
    expect(webSearchRequest('auto', 'Write a poem', { now })).toBeUndefined();
  });
});
