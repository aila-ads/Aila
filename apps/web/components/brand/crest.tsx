import { cn } from '../../lib/utils';

/**
 * Aila monogram crest: a serif "A" inside a fine double brass oval with
 * small diamond finials. Drawn in paths only, so it needs no font or asset.
 * The letter uses the primary colour (forest green, ivory in dark mode).
 */
export function Crest({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g fill="none" stroke="var(--brass)">
        <ellipse cx="32" cy="32" rx="21.5" ry="27.5" strokeWidth="1.4" />
        <ellipse cx="32" cy="32" rx="19" ry="25" strokeWidth="0.7" />
      </g>
      <g fill="var(--brass)">
        <path d="M32 1.6 34 4.5 32 7.4 30 4.5Z" />
        <path d="M32 56.6 34 59.5 32 62.4 30 59.5Z" />
      </g>
      <path
        fill="var(--primary)"
        transform="translate(-0.7 0)"
        d="M31 16h2.4l8.2 27.6H37ZM31.4 17.6l.8 2.6-6.5 23.4h-1.5ZM27.1 33.2h7.7l.3 1.2h-8.3ZM21.8 43.6h6.4v1h-6.4ZM35 43.6h8.6v1H35Z"
      />
    </svg>
  );
}
