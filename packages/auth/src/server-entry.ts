export { getAuth } from './server';
export { getSessionState, getSessionUser, type SessionState } from './request';
export {
  AuthIdentityError,
  ensureAilaIdentity,
  type AuthIdentityErrorCode,
  type NeonAuthUser,
} from './identity';
export {
  auditLogData,
  recordAuditEvent,
  recordAuthEvent,
  type AuditEvent,
  type AuthAuditEvent,
  type AuthMethod,
} from './audit';
export { assertActiveIdentity, resolveAccountContext } from './context';
export {
  accountScope,
  authorize,
  canAccessAccount,
  evaluateAccountAccess,
  hasAppRole,
  ENTITLEMENT_KEYS,
  entitlementDenial,
  evaluateProAccess,
  evaluateTrial,
  grantApplies,
  isAccountOwner,
  PRODUCT_ENTITLEMENT_KEYS,
  resolveEntitlementKeys,
  TRIAL_DURATION_MS,
  type AccountAccessDecision,
  type AccountAccessDenialReason,
  type AccountContext,
  type EntitlementGrant,
  type EntitlementKey,
  type IdentityRecord,
  type ProAccessDecision,
  type TrialRecord,
  type TrialState,
} from './policies';
export {
  getTrialState,
  getTrialSummary,
  type TrialSummary,
} from './trial';
export {
  can,
  getEntitlementSummary,
  requireEntitlement,
  resolveEntitlements,
  type EntitlementResolution,
  type EntitlementSummary,
} from './entitlements';
export {
  clientIpFrom,
  withinRateLimits,
  type RateLimitCheck,
  type RateLimitName,
} from './rate-limit';
export {
  changePassword,
  getAccountOverview,
  getPasswordStatus,
  listSessions,
  revokeSession,
  updateProfile,
  updateSettings,
  type AccountOverview,
  type AccountSession,
} from './account';
