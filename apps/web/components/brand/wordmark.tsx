import { cn } from '../../lib/utils';

/** Engraved "AILA" wordmark: Cormorant Garamond capitals with wide tracking. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        // The negative margin cancels the tracking after the last letter so it centres.
        'mr-[-0.3em] font-serif font-semibold tracking-[0.3em] text-primary uppercase',
        className,
      )}
    >
      Aila
    </span>
  );
}
