'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { firstIssueMessage, updateProfileSchema } from '@aila/validation';
import { api, apiErrorMessage } from '../../lib/trpc/client';
import { Button } from '../ui/button';

type Status = { readonly kind: 'idle' | 'saved' } | { readonly kind: 'error'; readonly message: string };

export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({
      displayName: new FormData(event.currentTarget).get('displayName'),
    });

    if (!parsed.success) {
      setStatus({ kind: 'error', message: firstIssueMessage(parsed.error) });
      return;
    }

    startTransition(async () => {
      try {
        await api.account.updateProfile.mutate(parsed.data);
        setStatus({ kind: 'saved' });
        router.refresh();
      } catch (error) {
        setStatus({ kind: 'error', message: apiErrorMessage(error) });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <label htmlFor="displayName">Name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          defaultValue={displayName}
          maxLength={100}
          required
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} readOnly aria-describedby="email-help" />
        <p id="email-help" className="text-sm text-muted-foreground">Your sign-in email cannot be changed here.</p>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
        {status.kind === 'saved' ? 'Name saved.' : null}
      </p>
      {status.kind === 'error' ? <p role="alert" className="text-sm text-destructive">{status.message}</p> : null}

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? 'Saving…' : 'Save name'}
      </Button>
    </form>
  );
}
