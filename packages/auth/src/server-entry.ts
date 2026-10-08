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
  evaluateProAccess,
  evaluateTrial,
  isAccountOwner,
  TRIAL_DURATION_MS,
  type AccountAccessDecision,
  type AccountAccessDenialReason,
  type AccountContext,
  type IdentityRecord,
  type ProAccessDecision,
  type TrialRecord,
  type TrialState,
} from './policies';
export {
  getTrialState,
  getTrialSummary,
  requireProAccess,
  type TrialSummary,
} from './trial';
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
