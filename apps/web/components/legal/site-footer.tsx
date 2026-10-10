import Link from 'next/link';
import { cn } from '../../lib/utils';
import { LEGAL } from './legal-facts';

/**
 * Small footer for public, account and signed-in pages: the operator's name
 * and links to the Privacy Policy, Terms of Service and contact email.
 */
export function SiteFooter({ className }: { className?: string }) {
  const linkClass =
    'text-muted-foreground no-underline transition-colors outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50';

  return (
    <footer
      className={cn(
        'flex flex-col items-center gap-2 border-t border-brass/40 pt-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left',
        className,
      )}
    >
      <p className="text-xs">
        © {new Date().getFullYear()} {LEGAL.operator}
      </p>
      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>
        <Link href="/terms" className={linkClass}>
          Terms of Service
        </Link>
        <a href={`mailto:${LEGAL.email}`} className={linkClass}>
          {LEGAL.email}
        </a>
      </nav>
    </footer>
  );
}
