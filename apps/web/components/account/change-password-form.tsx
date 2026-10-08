'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { changePasswordSchema, firstIssueMessage } from '@aila/validation';
import { api, apiErrorMessage } from '../../lib/trpc/client';

type Status = { readonly kind: 'idle' | 'saved' } | { readonly kind: 'error'; readonly message: string };

export function ChangePasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
      confirmation: form.get('confirmation'),
    });

    if (!parsed.success) {
      setStatus({ kind: 'error', message: firstIssueMessage(parsed.error) });
      return;
    }

    startTransition(async () => {
      try {
        await api.account.password.change.mutate(parsed.data);
        formElement.reset();
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
        <label htmlFor="currentPassword">Current password</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </div>

      <div>
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          aria-describedby="newPassword-help"
          required
        />
        <p id="newPassword-help">Use 8 to 128 characters.</p>
      </div>

      <div>
        <label htmlFor="newPasswordConfirmation">Confirm new password</label>
        <input
          id="newPasswordConfirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </div>

      <p role="status" aria-live="polite">
        {status.kind === 'saved'
          ? 'Password changed. Your other devices have been signed out.'
          : null}
      </p>
      {status.kind === 'error' ? <p role="alert">{status.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}
