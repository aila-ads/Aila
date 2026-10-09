'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRODUCTS } from '../dashboard/products';
import { cn } from '../../lib/utils';

type NavItem = { readonly label: string; readonly href: string | null };

/** Main navigation (PRODUCT-SPEC §8). Items without a route are shown as coming soon. */
const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  ...PRODUCTS.map((product) => ({ label: product.name.replace('Aila ', ''), href: product.href })),
  { label: 'Projects', href: null },
  { label: 'Files', href: '/files' },
  { label: 'Settings', href: '/settings' },
];

const itemClass =
  'flex min-h-11 items-center justify-between label-caps rounded-md px-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="grid gap-1">
      {NAV_ITEMS.map((item) => {
        if (!item.href) {
          return (
            <li key={item.label}>
              <span aria-disabled="true" className={cn(itemClass, 'text-muted-foreground')}>
                {item.label}
                <span className="font-serif text-sm tracking-normal normal-case">Coming soon</span>
              </span>
            </li>
          );
        }

        const current = pathname === item.href;

        return (
          <li key={item.label}>
            <Link
              href={item.href}
              aria-current={current ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                itemClass,
                current ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
