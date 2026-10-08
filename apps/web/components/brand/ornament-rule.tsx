import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Ornamental divider: fine double brass lines with a small centred diamond,
 * or a centred label (for example a section heading) when children are given.
 */
export function OrnamentRule({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span aria-hidden="true" className="h-1 flex-1 border-y border-brass/70" />
      {children ?? (
        <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2 shrink-0 fill-brass">
          <path d="M4 0 8 4 4 8 0 4Z" />
        </svg>
      )}
      <span aria-hidden="true" className="h-1 flex-1 border-y border-brass/70" />
    </div>
  );
}
