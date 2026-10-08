'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { firstIssueMessage, updateSettingsSchema } from '@aila/validation';
import { api, apiErrorMessage } from '../../lib/trpc/client';

type Status = { readonly kind: 'idle' | 'saved' } | { readonly kind: 'error'; readonly message: string };

type Props = {
  locale: string;
  timezone: string;
  locales: ReadonlyArray<{ value: string; label: string }>;
  timeZones: readonly string[];
};

export function PreferencesForm({ locale, timezone, locales, timeZones }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = updateSettingsSchema.safeParse({
      locale: form.get('locale'),
      timezone: form.get('timezone'),
    });

    if (!parsed.success) {
      setStatus({ kind: 'error', message: firstIssueMessage(parsed.error) });
      return;
    }

    startTransition(async () => {
      try {
        await api.account.updateSettings.mutate(parsed.data);
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
        <label htmlFor="locale">Language</label>
        <select id="locale" name="locale" defaultValue={locale} required>
          {locales.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="timezone">Time zone</label>
        <select id="timezone" name="timezone" defaultValue={timezone} required>
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <p role="status" aria-live="polite">
        {status.kind === 'saved' ? 'Preferences saved.' : null}
      </p>
      {status.kind === 'error' ? <p role="alert">{status.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
}
