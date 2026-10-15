'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CheckoutMethod } from '@aila/billing';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

export type PaymentChoice = {
  readonly method: CheckoutMethod;
  readonly name: string;
  readonly methods: string;
  readonly price: string;
  readonly note: string;
};

/**
 * The configured payment methods, one row each. The chosen method's
 * checkout is created on the server, then the browser goes to the
 * provider's hosted page; no payment script runs on Aila.
 */
export function PaymentOptions({ choices }: { choices: readonly PaymentChoice[] }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<CheckoutMethod | null>(null);
  const [pending, startTransition] = useTransition();

  function pay(method: CheckoutMethod) {
    setError(null);
    setOpening(method);
    startTransition(async () => {
      try {
        const { url } = await api.billing.checkout.mutate({ method });
        window.location.assign(url);
      } catch (caught) {
        setOpening(null);
        setError(apiErrorMessage(caught));
      }
    });
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-3" aria-label="Payment methods">
        {choices.map((choice) => (
          <li
            key={choice.method}
            className="grid gap-3 rounded-md border border-border bg-card/60 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="grid gap-1">
              <p className="font-serif text-lg tracking-[0.02em]">{choice.name}</p>
              <p className="text-sm text-muted-foreground">{choice.methods}</p>
              <p className="text-sm">
                <span className="font-serif text-xl">{choice.price}</span>
                <span className="text-muted-foreground"> {choice.note}</span>
              </p>
            </div>
            <Button
              variant={choice.method === 'FLUTTERWAVE_CARD_PLAN' ? 'outline' : 'default'}
              disabled={pending}
              onClick={() => pay(choice.method)}
              aria-label={`Pay with ${choice.name}`}
            >
              {opening === choice.method ? 'Opening…' : 'Pay'}
            </Button>
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </div>
  );
}

/** Cancels renewal after a confirmation step. */
export function CancelSubscription({ accessUntil }: { accessUntil: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      try {
        await api.billing.cancel.mutate();
        setConfirming(false);
        router.refresh();
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    });
  }

  if (!confirming) {
    return (
      <div className="grid justify-items-start gap-2">
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Cancel subscription
        </Button>
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-3">
      <p className="text-sm">
        Aila Pro will not renew.
        {accessUntil ? ` You keep access until ${accessUntil}.` : ''} Your account and data stay
        available.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
          Keep Aila Pro
        </Button>
        <Button
          disabled={pending}
          onClick={cancel}
          className="bg-destructive text-primary-foreground hover:bg-destructive/90"
        >
          {pending ? 'Cancelling…' : 'Confirm cancellation'}
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
