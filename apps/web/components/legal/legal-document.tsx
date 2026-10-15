import type { ReactNode } from 'react';
import Link from 'next/link';
import { Crest } from '../brand/crest';
import { OrnamentRule } from '../brand/ornament-rule';
import { Wordmark } from '../brand/wordmark';
import { LEGAL } from './legal-facts';
import { SiteFooter } from './site-footer';

export type LegalSection = {
  /** Anchor id, used by the table of contents. */
  readonly id: string;
  readonly title: string;
  readonly body: ReactNode;
};

/**
 * Frame for the public legal pages: brand header, title, last-updated date,
 * a table of contents and numbered sections, then the site footer.
 */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-3xl content-start gap-8 px-6 py-10 sm:py-14">
      <header className="grid justify-items-center gap-5">
        <Link
          href="/"
          aria-label="Aila home"
          className="flex items-center gap-2.5 rounded-md px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Crest className="size-10" />
          <Wordmark className="text-2xl" />
        </Link>
        <OrnamentRule className="w-full" />
      </header>

      <main id="main" className="legal-prose">
        <h1>{title}</h1>
        <p className="label-caps text-brass-ink">Last updated {LEGAL.lastUpdated}</p>
        {intro}

        <nav aria-labelledby="contents-heading" className="legal-contents">
          <h2 id="contents-heading">Contents</h2>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section, index) => (
          <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id}>
              <span className="text-brass-ink">{index + 1}.</span> {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </main>

      <SiteFooter />
    </div>
  );
}
