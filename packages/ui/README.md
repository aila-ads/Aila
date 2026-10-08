# @aila/ui

Shared UI foundation for Aila: Tailwind CSS v4 theme tokens and shadcn/ui
components ("new-york" style, neutral base colour). It follows
`docs/architecture/APPLICATION-ARCHITECTURE.md` §9–10 (one shared,
product-agnostic UI foundation).

## Use

```tsx
// apps/web/app/globals.css
@import "@aila/ui/globals.css";

// any component
import { Button } from '@aila/ui/components/button';
import { cn } from '@aila/ui/lib/utils';
```

The consuming app needs `@tailwindcss/postcss` in its PostCSS config and must
list `@aila/ui` in `transpilePackages` (already done in `apps/web`).

## Components

`button`, `input`, `label`, `card`, `dialog`, `dropdown-menu`.

## Adding a component

The components were generated with the shadcn CLI (`shadcn@4.21.4`). The CLI
resolved this package's `utils` alias to an unrelated npm package named `cn`,
so the imports were switched to relative paths (`../lib/utils`, `./button`)
and no `components.json` is kept. To add a component, copy its source from
https://ui.shadcn.com (new-york style) into `src/components/`, change
`@/lib/utils` to `../lib/utils`, and add any `radix-ui`/`lucide-react` imports
it needs. Only add components that a feature actually uses.

## Not decided yet (docs are silent)

Brand colours, fonts, dark mode switching and RTL support. Dark tokens exist
in `globals.css` but nothing turns them on.
