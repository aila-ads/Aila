import type { EntitlementKey } from '@aila/auth/server';

/**
 * The six Aila products (PRODUCT-SPEC §10-15). No product workspace exists
 * yet, so none has a route; each gets one when its step ships.
 */
export const PRODUCTS: ReadonlyArray<{
  readonly key: EntitlementKey;
  readonly name: string;
  readonly purpose: string;
  readonly href: string | null;
}> = [
  {
    key: 'intelligence',
    name: 'Aila Intelligence',
    purpose: 'A general-purpose AI workspace for conversations and ideas.',
    href: null,
  },
  {
    key: 'writer',
    name: 'Aila Writer',
    purpose: 'A long-form writing workspace for substantial documents.',
    href: null,
  },
  {
    key: 'translate',
    name: 'Aila Translate',
    purpose: 'Contextual multilingual translation, not word-for-word replacement.',
    href: null,
  },
  {
    key: 'ads',
    name: 'Aila Ads',
    purpose: 'Plan, create and analyze advertising campaigns.',
    href: null,
  },
  {
    key: 'legal',
    name: 'Aila Legal',
    purpose: 'AI-assisted legal document analysis. It does not replace legal counsel.',
    href: null,
  },
  {
    key: 'coding',
    name: 'Aila Coding',
    purpose: 'A development workspace for understanding and producing software.',
    href: null,
  },
];
