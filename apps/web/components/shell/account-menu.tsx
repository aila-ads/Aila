'use client';

import Link from 'next/link';
import { signOut } from '@aila/auth/actions';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export type ShellUser = { readonly name: string | null; readonly email: string };

/** Account menu: who is signed in, settings and sign out. */
export function AccountMenu({ user }: { user: ShellUser }) {
  const label = user.name || user.email;

  return (
    <>
      <form id="account-sign-out" action={signOut} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              {label.charAt(0).toUpperCase()}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <span className="block truncate font-medium">{label}</span>
            {user.name ? (
              <span className="block truncate text-muted-foreground">{user.email}</span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">Account settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="submit" form="account-sign-out">
              Sign out
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
