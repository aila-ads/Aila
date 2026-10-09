import type { EntitlementSummary, TrialSummary } from '@aila/auth/server';
import { TrialStatus } from '../account/trial-status';
import { BillingLink } from '../billing/billing-link';
import { OrnamentRule } from '../brand/ornament-rule';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { PRODUCTS } from './products';

export type DashboardData = {
  readonly name: string;
  readonly trial: TrialSummary;
  readonly entitlements: EntitlementSummary;
};

/**
 * The signed-in home (PRODUCT-SPEC §9, SCOPE §6, AC-050). Everything shown
 * comes from the server; nothing here decides access.
 */
export function DashboardView({ name, trial, entitlements }: DashboardData) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="welcome-heading" className="grid gap-1">
        <h1 id="welcome-heading" className="text-3xl font-medium tracking-[0.02em] sm:text-4xl">
          Welcome, {name}
        </h1>
        <p className="text-muted-foreground">Aila — think, create, and build.</p>
        <OrnamentRule className="mt-5" />
      </section>

      <Card aria-labelledby="plan-heading" role="region">
        <CardHeader>
          <CardTitle id="plan-heading">Your plan</CardTitle>
          <div className="text-sm text-muted-foreground">
            <TrialStatus trial={trial} granted={entitlements.source === 'GRANT'} />
          </div>
        </CardHeader>
        <CardContent>
          <BillingLink trial={trial} />
        </CardContent>
      </Card>

      <section aria-labelledby="products-heading" className="grid gap-4">
        <OrnamentRule>
          <h2 id="products-heading" className="font-sans label-caps text-brass-ink">
            Products
          </h2>
        </OrnamentRule>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => {
            const available = entitlements.keys.includes(product.key);

            return (
              <li key={product.key} className="flex">
                <Card className="w-full gap-4 transition-colors hover:border-brass">
                  <CardHeader>
                    <h3 className="text-xl leading-none font-semibold">{product.name}</h3>
                    <CardDescription>{product.purpose}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-wrap gap-2">
                    <Badge variant={available ? 'default' : 'outline'}>
                      {available ? 'Available' : 'Requires Aila Pro'}
                    </Badge>
                    {product.href ? null : <Badge variant="secondary">Coming soon</Badge>}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card aria-labelledby="recent-heading" role="region">
          <CardHeader>
            <CardTitle id="recent-heading">Recent work</CardTitle>
            <CardDescription>No recent work yet. Your latest work will appear here.</CardDescription>
          </CardHeader>
        </Card>
        <Card aria-labelledby="projects-heading" role="region">
          <CardHeader>
            <CardTitle id="projects-heading">Projects</CardTitle>
            <CardDescription>No projects yet. Your projects will appear here.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
