import type { ReactNode } from 'react';
import Link from 'next/link';
import { Crest } from '../brand/crest';
import { Wordmark } from '../brand/wordmark';
import { AccountMenu, type ShellUser } from './account-menu';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';

/**
 * The signed-in application frame: header with the account menu, a sidebar
 * on large screens and a menu sheet on small ones (PRODUCT-SPEC §8, §28).
 */
export function AppShell({ user, children }: { user: ShellUser | null; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-[3px] focus:ring-ring/50"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <MobileNav />
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-md px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Crest className="size-9" />
          <Wordmark className="text-xl" />
        </Link>
        <div className="ml-auto">{user ? <AccountMenu user={user} /> : null}</div>
      </header>
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r lg:block">
          <nav aria-label="Main" className="sticky top-14 p-4">
            <NavLinks />
          </nav>
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
