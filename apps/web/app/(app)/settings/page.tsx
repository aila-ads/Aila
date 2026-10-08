import type { Metadata } from 'next';
import { SUPPORTED_LOCALES } from '@aila/validation';
import { PageError } from '../../../components/account/page-error';
import { SettingsView } from '../../../components/account/settings-view';
import type { SessionItem } from '../../../components/account/session-list';
import { loadPageData } from '../../../server/api/caller';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account settings · Aila' };

const LOCALE_LABELS: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  'en-US': 'English (United States)',
};

function timeZoneOptions(current: string): string[] {
  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  zones.add(current);
  return [...zones].sort();
}

export default async function SettingsPage() {
  const result = await loadPageData('/settings', async (api) => {
    const [overview, sessions, password, trial, entitlements] = await Promise.all([
      api.account.me(),
      api.account.sessions.list(),
      api.account.password.status(),
      api.account.trial(),
      api.account.entitlements(),
    ]);
    return { overview, sessions, password, trial, entitlements };
  });

  if ('error' in result) {
    return <PageError title="Account settings" message={result.error} retryHref="/settings" />;
  }

  const { overview, sessions, password, trial, entitlements } = result.data;
  const { locale, timezone } = overview.settings;
  const formatDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  });
  const sessionItems: SessionItem[] = sessions.map((session) => ({
    id: session.id,
    current: session.current,
    device: session.device,
    signedIn: formatDate.format(new Date(session.createdAt)),
    expires: formatDate.format(new Date(session.expiresAt)),
  }));

  return (
    <SettingsView
      displayName={overview.user.displayName ?? ''}
      email={overview.user.email}
      locale={locale}
      timezone={timezone}
      locales={SUPPORTED_LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
      timeZones={timeZoneOptions(timezone)}
      hasPassword={password.hasPassword}
      sessions={sessionItems}
      trial={trial}
      granted={entitlements.source === 'GRANT'}
    />
  );
}
