'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { firstIssueMessage, updateProfileSchema } from '@aila/validation';
import { api, apiErrorMessage } from '../../lib/trpc/client';

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
    <form onSubmit={onSubmit} noValidate>
      <div>
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

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} readOnly aria-describedby="email-help" />
        <p id="email-help">Your sign-in email cannot be changed here.</p>
      </div>

      <p role="status" aria-live="polite">
        {status.kind === 'saved' ? 'Name saved.' : null}
      </p>
      {status.kind === 'error' ? <p role="alert">{status.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
    </form>
  );
}
