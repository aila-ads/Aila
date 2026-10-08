import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_KEYS,
  entitlementDenial,
  resolveEntitlementKeys,
  type EntitlementGrant,
  type ProAccessDecision,
} from '../../../packages/auth/src/policies';

const now = new Date('2026-10-08T12:00:00.000Z');
const before = new Date(now.getTime() - 1);
const after = new Date(now.getTime() + 1);
const trial: ProAccessDecision = { allowed: true, source: 'TRIAL' };
const subscription: ProAccessDecision = { allowed: true, source: 'SUBSCRIPTION' };
const expired: ProAccessDecision = { allowed: false, reason: 'TRIAL_EXPIRED' };
const none: ProAccessDecision = { allowed: false, reason: 'SUBSCRIPTION_REQUIRED' };

const grant = (overrides: Partial<EntitlementGrant> = {}): EntitlementGrant => ({
  key: 'writer',
  status: 'ACTIVE',
  source: 'ADMIN',
  effectiveAt: before,
  expiresAt: null,
  ...overrides,
});

describe('resolveEntitlementKeys', () => {
  it('grants all 9 keys during the trial or with a subscription', () => {
    expect(ENTITLEMENT_KEYS).toHaveLength(9);
    expect(resolveEntitlementKeys(trial, [], now)).toEqual([...ENTITLEMENT_KEYS]);
    expect(resolveEntitlementKeys(subscription, [], now)).toEqual([...ENTITLEMENT_KEYS]);
  });

  it('grants nothing after the trial without a subscription or grant', () => {
    expect(resolveEntitlementKeys(expired, [], now)).toEqual([]);
  });

  it('applies ADMIN and SYSTEM grants inside their window', () => {
    expect(
      resolveEntitlementKeys(
        expired,
        [grant(), grant({ key: 'advanced_models', source: 'SYSTEM', expiresAt: after })],
        now,
      ),
    ).toEqual(['writer', 'advanced_models']);
  });

  it('ignores grants that are not active, not yet started, ended, unknown or from another source', () => {
    const ignored = [
      grant({ status: 'REVOKED' }),
      grant({ status: 'SUSPENDED' }),
      grant({ effectiveAt: after }),
      grant({ expiresAt: now }),
      grant({ key: 'writer:access' }),
      grant({ source: 'TRIAL' }),
    ];
    expect(resolveEntitlementKeys(none, ignored, now)).toEqual([]);
  });
});

describe('entitlementDenial', () => {
  it('allows an available key', () => {
    expect(entitlementDenial('writer', ['writer'], expired)).toBeNull();
  });

  it('reports the trial or subscription reason without Pro access', () => {
    expect(entitlementDenial('ads', ['writer'], expired)).toBe('TRIAL_EXPIRED');
    expect(entitlementDenial('ads', [], none)).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('reports ENTITLEMENT_REQUIRED when Pro access does not include the key', () => {
    expect(entitlementDenial('ads', [], trial)).toBe('ENTITLEMENT_REQUIRED');
  });
});
