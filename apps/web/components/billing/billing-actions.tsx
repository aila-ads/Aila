'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

/** Starts a Flutterwave checkout created on the server and goes to it. */
export function SubscribeButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function subscribe() {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await api.billing.checkout.mutate();
        window.location.assign(url);
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    });
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button onClick={subscribe} disabled={pending}>
        {pending ? 'Opening checkout…' : 'Subscribe to Aila Pro'}
      </Button>
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
