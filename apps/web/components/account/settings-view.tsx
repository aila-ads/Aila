import type { ReactNode } from 'react';
import type { TrialSummary } from '@aila/auth/server';
import { BillingLink } from '../billing/billing-link';
import { OrnamentRule } from '../brand/ornament-rule';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChangePasswordForm } from './change-password-form';
import { PreferencesForm } from './preferences-form';
import { ProfileForm } from './profile-form';
import { SessionList, type SessionItem } from './session-list';
import { TrialStatus } from './trial-status';

export type SettingsData = {
  readonly displayName: string;
  readonly email: string;
  readonly locale: string;
  readonly timezone: string;
  readonly locales: ReadonlyArray<{ value: string; label: string }>;
  readonly timeZones: readonly string[];
  readonly hasPassword: boolean;
  readonly sessions: readonly SessionItem[];
  readonly trial: TrialSummary;
  readonly granted: boolean;
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card aria-labelledby={id} role="region">
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Account settings (AILA-V1-SCOPE §5, PRODUCT-SPEC §24). */
export function SettingsView(data: SettingsData) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-5">
        <h1 className="text-3xl font-medium tracking-[0.02em] sm:text-4xl">Account settings</h1>
        <OrnamentRule />
      </div>

      <Section id="profile-heading" title="Profile">
        <ProfileForm displayName={data.displayName} email={data.email} />
      </Section>

      <Section id="trial-heading" title="Your plan">
        <div className="grid gap-4">
          <div className="text-sm text-muted-foreground">
            <TrialStatus trial={data.trial} granted={data.granted} />
          </div>
          <BillingLink trial={data.trial} />
        </div>
      </Section>

      <Section id="preferences-heading" title="Language and time zone">
        <PreferencesForm
          locale={data.locale}
          timezone={data.timezone}
          locales={data.locales}
          timeZones={[...data.timeZones]}
        />
      </Section>

      <Section id="password-heading" title="Password">
        {data.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">
            You sign in with Google, so this account has no Aila password to change.
          </p>
        )}
      </Section>

      <Section id="sessions-heading" title="Signed-in devices">
        <SessionList sessions={data.sessions} />
      </Section>
    </div>
  );
}
