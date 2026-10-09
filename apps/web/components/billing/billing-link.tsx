import Link from 'next/link';
import type { TrialSummary } from '@aila/auth/server';
import { Button } from '../ui/button';

/** Link to Aila Pro billing (PRODUCT-SPEC §7.4: no Pro access leads to upgrade). */
export function BillingLink({ trial }: { trial: TrialSummary }) {
  const subscribed = trial.proAccess && !trial.active;

  return (
    <Button asChild variant="outline" className="w-fit">
      <Link href="/billing">{subscribed ? 'Manage billing' : 'Get Aila Pro'}</Link>
    </Button>
  );
}
