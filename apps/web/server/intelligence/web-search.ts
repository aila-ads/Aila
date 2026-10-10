import type { IntelligenceWebSearchMode } from '@aila/validation';

/**
 * When Aila Intelligence searches the web. The person chooses Auto, On or
 * Off in the message box. Auto uses this heuristic instead of an extra AI
 * call: a search costs money, so it runs only for messages that clearly
 * need fresh or outside information. The message is only read here; it is
 * never logged.
 */

/** Words that ask for current or changing information. */
const CURRENT =
  /\b(today|tonight|yesterday|tomorrow|this (week|month|year|weekend)|right now|as of now|latest|recent(ly)?|newest|breaking|news|headlines?|current (events?|affairs|president|governor|ceo|price|rate|champions?)|scores?|fixtures?|results? of|weather|forecast|trending|happening|just announced)\b/i;

/** Prices, rates and markets. */
const PRICES =
  /\b(price|prices|exchange rates?|dollar rate|naira rate|stock price|share price|stock market|market cap|bitcoin|btc|ethereum|inflation rate|interest rate)\b/i;

/** Explicit requests to look something up. */
const LOOKUP =
  /\b((can|could|please) you search|search (for|the web|online|it|this|that)|web search|look (it |this |that )?up|google (it|this|that)|find (it |out )?online|on the (web|internet)|websites?|web ?page|official site|link to|url)\b/i;

/** Questions about people, companies and events. */
const WHO =
  /\b(who (is|was|are|were|owns|founded|runs|leads|won|wins|invented|created)|what happened|when (is|was|will|does|did)|where is|is .{1,60} still|ceo of|founder of|president of|governor of|minister of)\b/i;

/** Words that begin questions or sentences and are not names. */
const NOT_NAMES = new Set(
  [
    'a', 'an', 'the', 'i', 'im', 'my', 'me', 'we', 'you', 'your', 'he', 'she', 'it', 'they', 'this', 'that',
    'what', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'which', 'is', 'are', 'was', 'were', 'do',
    'does', 'did', 'can', 'could', 'would', 'should', 'will', 'please', 'tell', 'give', 'write', 'explain',
    'list', 'show', 'help', 'make', 'create', 'summarize', 'summarise', 'translate', 'hello', 'hi', 'hey',
    'thanks', 'thank', 'ok', 'okay', 'yes', 'no', 'dear', 'mr', 'mrs', 'ms', 'dr', 'and', 'or', 'but', 'about',
    'aila', 'intelligence', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
    'november', 'december',
  ],
);

/** Messages that ask for information rather than writing or editing. */
const QUESTION = /\?|^\s*(who|what|when|where|which|how|is|are|was|were|does|did|tell me|give me|find|explain)\b/i;

/** Capitalised names of two or more words, e.g. "Chinua Achebe" or "Dangote Group". */
export function namedEntities(text: string): string[] {
  const names: string[] = [];

  for (const match of text.matchAll(/\b[A-Z][\p{L}'’-]*(?:\s+[A-Z][\p{L}'’-]*)+/gu)) {
    const words = match[0].split(/\s+/);

    while (words.length > 0 && NOT_NAMES.has(words[0]!.toLowerCase().replace(/[^a-z]/g, ''))) {
      words.shift();
    }

    if (words.length >= 2) {
      names.push(words.join(' '));
    }
  }

  return names;
}

/** A year at or after the current one, e.g. "2026" or "in 2027". */
function mentionsCurrentYear(text: string, now: Date): boolean {
  const year = now.getUTCFullYear();
  return [...text.matchAll(/\b(19|20)\d{2}\b/g)].some((match) => Number(match[0]) >= year);
}

/** Whether Auto should search the web for this message. */
export function needsWebSearch(
  prompt: string,
  options: { readonly context?: string; readonly now?: Date } = {},
): boolean {
  const text = prompt.trim();

  if (!text) {
    return false;
  }

  if (CURRENT.test(text) || PRICES.test(text) || LOOKUP.test(text) || WHO.test(text)) {
    return true;
  }

  if (mentionsCurrentYear(text, options.now ?? new Date())) {
    return true;
  }

  // A question about a named person or company the conversation has not covered.
  if (QUESTION.test(text)) {
    const context = (options.context ?? '').toLowerCase();
    return namedEntities(text).some((name) => !context.includes(name.toLowerCase()));
  }

  return false;
}

/**
 * The gateway setting for a message: On always searches (and says so when
 * the allowance is used up), Auto searches when the heuristic says so and
 * otherwise answers without, Off never searches.
 */
export function webSearchRequest(
  mode: IntelligenceWebSearchMode,
  prompt: string,
  options: { readonly context?: string; readonly now?: Date } = {},
): 'required' | 'if_available' | undefined {
  if (mode === 'on') {
    return 'required';
  }

  if (mode === 'auto' && needsWebSearch(prompt, options)) {
    return 'if_available';
  }

  return undefined;
}
