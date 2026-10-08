import type { TrialSummary } from '@aila/auth/server';

function timeLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}

/** Shows the server-provided trial state; it never decides access itself. */
export function TrialStatus({
  trial,
  granted = false,
}: {
  trial: TrialSummary;
  /** Access comes from an admin or system grant (server-resolved). */
  granted?: boolean;
}) {
  if (trial.active) {
    return <p>Free trial: {timeLeft(trial.remainingMs)} left.</p>;
  }

  if (trial.proAccess) {
    return <p>Aila Pro is active.</p>;
  }

  if (granted) {
    return <p>Your account has access to Aila.</p>;
  }

  return (
    <p>
      {trial.status === 'NONE' ? 'An Aila Pro subscription is required' : 'Your free trial has ended'}
      . Aila Pro is required for Pro features. Your account and data stay available.
    </p>
  );
}
