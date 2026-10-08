'use client';

import { useState } from 'react';
import { MenuIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../ui/sheet';
import { Wordmark } from '../brand/wordmark';
import { NavLinks } from './nav-links';

/** The navigation menu below the desktop breakpoint. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <MenuIcon className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle className="flex min-h-11 items-center px-3">
          <Wordmark className="text-xl" />
        </SheetTitle>
        <nav aria-label="Main">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
