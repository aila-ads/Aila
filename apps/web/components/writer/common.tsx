'use client';

import Link from 'next/link';
import { useCallback, useState, useTransition } from 'react';
import type { TrialSummary } from '@aila/auth/server';
import { TRPCClientError } from '@trpc/client';
import { apiErrorCode, apiErrorMessage } from '../../lib/trpc/client';
import { TrialStatus } from '../account/trial-status';
import { BillingLink } from '../billing/billing-link';
import { Button } from '../ui/button';

export const fieldClass =
  'w-full resize-y rounded-md border border-input bg-background p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

/** Codes a subscription resolves; the message gets a billing link. */
const BILLING_CODES = new Set(['TRIAL_EXPIRED', 'SUBSCRIPTION_REQUIRED', 'ENTITLEMENT_REQUIRED']);

export type ActionError = { readonly message: string; readonly code: string | null };

/**
 * Runs one API call at a time for a control group, with a pending flag and a
 * safe error message. The server decides access; this only reports it.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const run = useCallback((action: () => Promise<unknown>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onDone?.();
      } catch (caught) {
        setError({ message: apiErrorMessage(caught), code: apiErrorCode(caught) });
      }
    });
  }, []);

  return { pending, error, setError, run };
}

export function ErrorNotice({ error }: { error: ActionError | null }) {
  if (!error) {
    return null;
  }

  return (
    <div role="alert" className="grid gap-2 text-sm text-destructive">
      <p>{error.message}</p>
      {error.code && BILLING_CODES.has(error.code) ? (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/billing">Get Aila Pro</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Shown when the account cannot write: existing work stays readable (PRODUCT-SPEC §5). */
export function ReadOnlyNotice({
  trial,
  granted,
  children,
}: {
  trial: TrialSummary;
  granted: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border border-brass/60 p-4 text-sm text-muted-foreground">
      <TrialStatus trial={trial} granted={granted} />
      <p>{children}</p>
      <BillingLink trial={trial} />
    </div>
  );
}

/** Shown on archived projects, which are read-only until restored (WRITER §7.2). */
export function ArchivedNotice() {
  return (
    <p className="border border-brass/60 p-4 text-sm text-muted-foreground">
      This project is archived. It stays readable and exportable; restore it from the project page to edit again.
    </p>
  );
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** The application error reason of a failed API call, if any. */
export function apiErrorReason(error: unknown): string | null {
  if (error instanceof TRPCClientError) {
    const data: unknown = error.data;
    const reason: unknown = typeof data === 'object' && data !== null ? Reflect.get(data, 'reason') : null;
    return typeof reason === 'string' ? reason : null;
  }

  return null;
}

/** True when the request never got an answer from the server (offline, DNS, dropped connection). */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }

  return error instanceof TRPCClientError && (error.data === undefined || error.data === null) && apiErrorCode(error) === null;
}
