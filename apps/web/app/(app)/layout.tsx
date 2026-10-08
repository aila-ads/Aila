import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell/app-shell';
import type { ShellUser } from '../../components/shell/account-menu';
import { getServerApi } from '../../server/api/caller';

export const dynamic = 'force-dynamic';

/**
 * Frame for signed-in pages. The page itself loads and authorizes its data
 * (and redirects when signed out); the shell only needs the user's name.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let user: ShellUser | null = null;

  try {
    const overview = await getServerApi().account.me();
    user = { name: overview.user.displayName, email: overview.user.email };
  } catch {
    // The page shows the error or redirects; the shell renders without the menu.
  }

  return <AppShell user={user}>{children}</AppShell>;
}
