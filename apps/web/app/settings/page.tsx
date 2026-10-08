import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORTED_LOCALES } from '@aila/validation';
import { ChangePasswordForm } from '../../components/account/change-password-form';
import { PreferencesForm } from '../../components/account/preferences-form';
import { ProfileForm } from '../../components/account/profile-form';
import { SessionList, type SessionItem } from '../../components/account/session-list';
import { SignOutButton } from '../../components/account/sign-out-button';
import { TrialStatus } from '../../components/account/trial-status';
import { loadPageData } from '../../server/api/caller';

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
    return (
      <main>
        <h1>Account settings</h1>
        <p role="alert">{result.error}</p>
        <SignOutButton />
      </main>
    );
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
    <main>
      <p>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>
      <h1>Account settings</h1>

      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading">Profile</h2>
        <ProfileForm displayName={overview.user.displayName ?? ''} email={overview.user.email} />
      </section>

      <section aria-labelledby="trial-heading">
        <h2 id="trial-heading">Free trial</h2>
        <TrialStatus trial={trial} granted={entitlements.source === 'GRANT'} />
      </section>

      <section aria-labelledby="preferences-heading">
        <h2 id="preferences-heading">Language and time zone</h2>
        <PreferencesForm
          locale={locale}
          timezone={timezone}
          locales={SUPPORTED_LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
          timeZones={timeZoneOptions(timezone)}
        />
      </section>

      <section aria-labelledby="password-heading">
        <h2 id="password-heading">Password</h2>
        {password.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p>You sign in with Google, so this account has no Aila password to change.</p>
        )}
      </section>

      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading">Signed-in devices</h2>
        <SessionList sessions={sessionItems} />
      </section>

      <SignOutButton />
    </main>
  );
}
