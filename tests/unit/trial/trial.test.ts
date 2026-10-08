import { describe, expect, it } from 'vitest';
import {
  evaluateProAccess,
  evaluateTrial,
  TRIAL_DURATION_MS,
  type TrialRecord,
} from '../../../packages/auth/src/policies';

const startedAt = new Date('2026-10-08T10:00:00.000Z');
const expiresAt = new Date(startedAt.getTime() + TRIAL_DURATION_MS);
const trial = (overrides: Partial<TrialRecord> = {}): TrialRecord => ({
  status: 'ACTIVE',
  startedAt,
  expiresAt,
  endedAt: null,
  ...overrides,
});

describe('evaluateTrial', () => {
  it('lasts exactly three hours', () => {
    expect(TRIAL_DURATION_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('is active before expiry with the remaining time', () => {
    const state = evaluateTrial(trial(), new Date(expiresAt.getTime() - 60_000));
    expect(state).toMatchObject({ status: 'ACTIVE', active: true, remainingMs: 60_000 });
  });

  it('is expired at exactly expiresAt and after', () => {
    for (const now of [expiresAt, new Date(expiresAt.getTime() + 1)]) {
      expect(evaluateTrial(trial(), now)).toMatchObject({
        status: 'EXPIRED',
        active: false,
        remainingMs: 0,
        endedAt: expiresAt,
      });
    }
  });

  it('never re-activates an ended trial', () => {
    const early = new Date(startedAt.getTime() + 1);
    for (const status of ['EXPIRED', 'CONVERTED', 'CANCELLED'] as const) {
      expect(evaluateTrial(trial({ status }), early).active).toBe(false);
    }
  });

  it('reports NONE without a trial', () => {
    expect(evaluateTrial(null, startedAt)).toMatchObject({ status: 'NONE', active: false });
  });
});

describe('evaluateProAccess', () => {
  const active = evaluateTrial(trial(), startedAt);
  const expired = evaluateTrial(trial(), expiresAt);
  const none = evaluateTrial(null, startedAt);

  it('allows an active trial', () => {
    expect(evaluateProAccess(active, false)).toEqual({ allowed: true, source: 'TRIAL' });
  });

  it('allows an active subscription after the trial', () => {
    expect(evaluateProAccess(expired, true)).toEqual({ allowed: true, source: 'SUBSCRIPTION' });
  });

  it('denies an expired trial without a subscription', () => {
    expect(evaluateProAccess(expired, false)).toEqual({ allowed: false, reason: 'TRIAL_EXPIRED' });
  });

  it('requires a subscription without a trial', () => {
    expect(evaluateProAccess(none, false)).toEqual({
      allowed: false,
      reason: 'SUBSCRIPTION_REQUIRED',
    });
  });
});
