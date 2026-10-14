import { describe, expect, it } from 'vitest';
import {
  accountScope,
  authorize,
  canAccessAccount,
  evaluateAccountAccess,
  hasAppRole,
  isAccountOwner,
  type AccountContext,
  type IdentityRecord,
} from '../../../packages/auth/src/policies';
import { AppError } from '../../../packages/validation/src/errors';

function identity(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  return {
    id: 'user_1',
    accountId: 'account_1',
    status: 'ACTIVE',
    deletedAt: null,
    account: { id: 'account_1', status: 'ACTIVE', deletedAt: null },
    memberships: [{ accountId: 'account_1', role: 'OWNER' }],
    ...overrides,
  };
}

const context: AccountContext = {
  user: { id: 'user_1', email: 'person@example.com', name: 'Person', role: 'USER' },
  account: { id: 'account_1' },
  membership: { role: 'OWNER' },
  session: { id: 'session_1', expiresAt: new Date('2030-01-01T00:00:00Z') },
};

describe('evaluateAccountAccess', () => {
  it('allows an active member of an active account', () => {
    expect(evaluateAccountAccess(identity())).toEqual({
      allowed: true,
      membershipRole: 'OWNER',
    });
  });

  it.each(['SUSPENDED', 'DELETED'] as const)('refuses a %s user', (status) => {
    expect(evaluateAccountAccess(identity({ status }))).toEqual({
      allowed: false,
      reason: 'USER_INACTIVE',
    });
  });

  it('refuses a soft-deleted user', () => {
    expect(evaluateAccountAccess(identity({ deletedAt: new Date() }))).toMatchObject({
      allowed: false,
      reason: 'USER_INACTIVE',
    });
  });

  it.each(['SUSPENDED', 'DELETED'] as const)('refuses a %s account', (status) => {
    expect(
      evaluateAccountAccess(
        identity({ account: { id: 'account_1', status, deletedAt: null } }),
      ),
    ).toEqual({ allowed: false, reason: 'ACCOUNT_INACTIVE' });
  });

  it('refuses a soft-deleted account', () => {
    expect(
      evaluateAccountAccess(
        identity({ account: { id: 'account_1', status: 'ACTIVE', deletedAt: new Date() } }),
      ),
    ).toMatchObject({ allowed: false, reason: 'ACCOUNT_INACTIVE' });
  });

  it('refuses when the loaded account is not the user account', () => {
    expect(
      evaluateAccountAccess(
        identity({ account: { id: 'account_2', status: 'ACTIVE', deletedAt: null } }),
      ),
    ).toMatchObject({ allowed: false, reason: 'ACCOUNT_INACTIVE' });
  });

  it('refuses a user without a membership in their account', () => {
    expect(evaluateAccountAccess(identity({ memberships: [] }))).toEqual({
      allowed: false,
      reason: 'NO_MEMBERSHIP',
    });
    expect(
      evaluateAccountAccess(
        identity({ memberships: [{ accountId: 'account_2', role: 'OWNER' }] }),
      ),
    ).toEqual({ allowed: false, reason: 'NO_MEMBERSHIP' });
  });

  it('returns the role of the membership for the user account', () => {
    expect(
      evaluateAccountAccess(
        identity({
          memberships: [
            { accountId: 'account_2', role: 'OWNER' },
            { accountId: 'account_1', role: 'MEMBER' },
          ],
        }),
      ),
    ).toEqual({ allowed: true, membershipRole: 'MEMBER' });
  });
});

describe('account policies', () => {
  it('allows only the caller account', () => {
    expect(canAccessAccount(context, 'account_1')).toBe(true);
    expect(canAccessAccount(context, 'account_2')).toBe(false);
  });

  it('scopes queries to the caller account', () => {
    expect(accountScope(context)).toEqual({ accountId: 'account_1' });
  });

  it('recognises owners', () => {
    expect(isAccountOwner(context)).toBe(true);
    expect(isAccountOwner({ ...context, membership: { role: 'MEMBER' } })).toBe(false);
  });

  it('checks application roles exactly', () => {
    expect(hasAppRole(context, 'USER')).toBe(true);
    expect(hasAppRole(context, 'ADMIN')).toBe(false);
    expect(
      hasAppRole({ ...context, user: { ...context.user, role: 'ADMIN' } }, 'ADMIN'),
    ).toBe(true);
  });
});

describe('authorize', () => {
  it('passes when allowed', () => {
    expect(() => authorize(true)).not.toThrow();
  });

  it('throws FORBIDDEN by default', () => {
    expect(() => authorize(false)).toThrow(AppError);

    try {
      authorize(false);
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
  });

  it('can hide existence with NOT_FOUND', () => {
    try {
      authorize(false, 'NOT_FOUND');
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe('NOT_FOUND');
    }
  });
});
