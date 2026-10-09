'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * Shown when Flutterwave sends the customer back. Asks the server to
 * verify the payment with Flutterwave, then shows the billing page with the
 * result. The browser never decides whether the payment succeeded.
 */
export function CheckoutReturn({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    api.billing.confirm
      .mutate({ transactionId })
      .then(({ outcome }) => router.replace(`/billing?checkout=${outcome.toLowerCase()}`))
      .catch((caught: unknown) => setError(apiErrorMessage(caught)));
  }, [router, transactionId]);

  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle>Confirming your payment</CardTitle>
        {error ? (
          <CardDescription role="alert">
            {error} If you were charged, Aila Pro is activated automatically as soon as Flutterwave
            confirms the payment.{' '}
            <Link href="/billing" className="underline underline-offset-4">
              Back to billing
            </Link>
          </CardDescription>
        ) : (
          <CardDescription>Checking the payment with Flutterwave…</CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}
