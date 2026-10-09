# Aila V1 Platform Foundation Specification

**Product:** Aila  
**Release:** V1.0  
**Status:** Production Specification  
**Brand:** Aila — think, create, and build.

---

# 1. Purpose

The Aila Platform Foundation provides the shared production infrastructure used by every Aila product.

It establishes one authoritative implementation for:

- Identity
- Accounts
- Profiles
- Sessions
- Trial lifecycle
- Subscription state
- Entitlements
- Usage
- Projects
- Project membership
- Files
- Notifications
- User settings
- Audit logging
- Shared authorization
- Shared validation
- Shared error handling

The six Aila products must consume these shared capabilities rather than implementing independent versions.

---

# 2. Products Using the Foundation

The foundation serves:

1. Aila Intelligence
2. Aila Writer
3. Aila Translate
4. Aila Ads
5. Aila Legal
6. Aila Coding

Each product remains functionally distinct while sharing the same:

- Account
- User identity
- Authentication
- Subscription
- Trial
- Entitlements
- Projects
- Files
- Storage
- Usage
- Notifications
- Security model

---

# 3. Architectural Rule

There must be one authoritative implementation for each shared concern.

Examples:

```text
Authentication
    → shared auth service

Authorization
    → shared authorization layer

Entitlements
    → shared entitlement service

Trial
    → shared trial service

Usage
    → shared usage service

Files
    → shared file service

Storage
    → shared storage service

Notifications
    → shared notification service
```

Product code must not recreate these systems.

---

# 4. Identity Model

Aila uses Neon Auth (Managed Better Auth) as the authentication authority.

The application database stores Aila-specific identity and account information.

Conceptually:

```text
Neon Auth
    ↓
Authenticated Identity
    ↓
Aila User
    ↓
Aila Account
    ↓
Profile / Membership / Settings
```

`User.authUserId` stores the Neon Auth user ID.

Authentication credentials must remain managed by the authentication system.

Application authorization must remain under Aila's server-side control.

---

# 5. Account Model

An account represents the primary ownership boundary for Aila data.

An account may contain:

- One or more users where supported
- Subscription
- Trial
- Entitlements
- Projects
- Files
- Conversations
- Usage records
- Notifications
- Settings
- Product data

Every account-owned resource must have a clear ownership relationship.

---

# 6. User Model

A user represents an authenticated human identity associated with an Aila account.

User data may include:

- User ID
- Account ID
- Display name
- Avatar reference
- Locale
- Time zone
- Preferences
- Created timestamp
- Updated timestamp

Sensitive authentication credentials must not be duplicated into application tables unnecessarily.

---

# 7. Authorization

Authorization is server-side.

Every protected operation must establish:

1. Authenticated identity
2. Account membership
3. Resource ownership or membership
4. Required permission
5. Entitlement where applicable

Example:

```text
Request
 ↓
Authenticate
 ↓
Resolve Account
 ↓
Resolve Resource
 ↓
Verify Ownership / Membership
 ↓
Verify Permission
 ↓
Verify Entitlement
 ↓
Execute Operation
```

The client cannot grant itself access by modifying request parameters.

---

# 8. Resource Ownership

Every protected resource must have a clear ownership model.

Examples:

```text
Account
 ├── Users
 ├── Projects
 │    ├── Files
 │    ├── Conversations
 │    └── Product Data
 ├── Usage
 └── Subscription
```

Resource IDs must never be treated as authorization.

A valid UUID or database identifier does not prove ownership.

---

# 9. Three-Hour Trial

Every eligible new account receives one three-hour free trial.

The trial is represented explicitly in the database.

Required fields include:

- Account ID
- Started at
- Expires at
- Status
- Ended at
- Created timestamp
- Updated timestamp

The server determines trial state.

The browser must never be the authority for whether the trial is active.

---

# 10. Trial Lifecycle

Example lifecycle:

```text
NOT_STARTED
    ↓
ACTIVE
    ↓
EXPIRED
```

Where necessary, operational states may also include:

```text
CANCELLED
ENDED
```

Trial expiration must be determined from authoritative server timestamps.

Client clocks must not be trusted.

---

# 11. Trial Invariants

The system must guarantee:

- One trial per eligible account.
- Trial duration is exactly the configured product duration.
- Trial expiration cannot be extended by modifying browser state.
- Trial state cannot be changed through client-controlled fields.
- Expired trials cannot regain Pro access without a valid entitlement.
- Trial status is consistent with stored timestamps.
- Trial creation is transactionally protected against duplicate creation.

---

# 12. Subscription

Aila uses Aila Pro as the paid subscription.

Aila Pro provides access to:

- Intelligence
- Writer
- Translate
- Ads
- Legal
- Coding
- Advanced models
- Higher limits
- Additional uploads
- Additional projects
- Priority access where supported

The exact commercial limits must be configuration-driven.

---

# 13. Subscription Provider

Flutterwave is the initial payment provider.

Billing must be isolated behind the Aila Billing Service.

```text
Aila
  ↓
Billing Service
  ↓
Flutterwave
```

Product code must not contain provider-specific billing logic.

This allows the payment provider to be changed without rewriting product authorization.

---

# 14. Subscription State

Subscription records should include:

- Account ID
- Provider
- Provider customer ID
- Provider subscription ID
- Plan
- Status
- Current period start
- Current period end
- Cancel-at-period-end
- Canceled-at
- Created-at
- Updated-at

Subscription status must be interpreted centrally.

---

# 15. Billing Webhooks

Billing webhooks must:

- Validate authenticity/signatures according to provider requirements.
- Validate event structure.
- Be idempotent.
- Persist provider event identifiers.
- Reject duplicate processing safely.
- Update subscription state transactionally.
- Never trust browser-submitted payment state.

A successfully displayed payment screen is not sufficient evidence of an active subscription.

---

# 16. Entitlements

Entitlements determine what an account may use.

Examples:

```text
intelligence
writer
translate
ads
legal
coding
file_upload
projects
advanced_models
```

The entitlement system must be centralized.

Products must ask the entitlement service rather than inspecting subscription fields directly.

Avoid:

```text
if plan === "pro"
```

throughout product code.

Prefer:

```text
can(account, entitlement)
```

or an equivalent centralized authorization API.

---

# 17. Entitlement Resolution

Entitlements may derive from:

- Active trial
- Active subscription
- Product configuration
- Account state
- Administrative controls where explicitly supported

Example:

```text
Account
 ↓
Trial / Subscription State
 ↓
Entitlement Resolution
 ↓
Effective Entitlements
 ↓
Product Authorization
```

The resolved state must be server-authoritative.

---

# 18. Usage Limits

Usage limits must be centralized.

Possible dimensions include:

- AI requests
- Tokens
- Upload size
- Upload count
- Projects
- Storage
- Background jobs
- Advanced model usage

Limits must be configuration-driven.

No product should independently implement its own subscription limit rules.

---

# 19. Usage Records

Usage records should capture:

- Account
- User
- Product
- Operation
- Model
- Provider
- Request ID
- Token usage
- Estimated cost where available
- Duration
- Status
- Timestamp

Sensitive user content must not be copied into usage telemetry unnecessarily.

---

# 20. Projects

Projects provide a shared organizational boundary.

A project may belong to:

- Intelligence
- Writer
- Translate
- Ads
- Legal
- Coding

A shared project model should provide common lifecycle functionality while product-specific tables hold specialized data.

---

# 21. Project Lifecycle

Supported lifecycle:

```text
Create
 ↓
Active
 ↓
Archive / Delete
```

Where deletion is reversible, restoration must be explicitly implemented.

Deletion must not leave unauthorized access through:

- Search indexes
- Vector indexes
- Cached data
- Object storage
- Background jobs

---

# 22. Project Membership

Where collaboration is supported, project membership must be explicit.

Membership should include:

- User
- Project
- Role
- Created timestamp
- Updated timestamp

Roles must be centrally defined.

Possible roles:

```text
OWNER
EDITOR
VIEWER
```

Only roles actually required by the product should be enabled.

---

# 23. Files

Files are shared platform resources.

The file service controls:

- Metadata
- Ownership
- Authorization
- Storage references
- Upload lifecycle
- Download authorization
- Deletion
- Processing status

Products should not directly implement storage authorization.

---

# 24. File Storage

Neon object storage (S3-compatible, branch-scoped) is the initial object storage system. Files are stored in the private bucket `storage`.

The application database stores authoritative file metadata.

Example:

```text
PostgreSQL
    ↓
File metadata
    ↓
Storage object reference
    ↓
Neon object storage
```

The browser must not receive unrestricted storage access.

Private objects require authorized access.

---

# 25. File Upload Pipeline

Production upload flow:

```text
Client
 ↓
Authentication
 ↓
Authorization
 ↓
Validation
 ↓
Size / Type Checks
 ↓
Secure Upload
 ↓
Storage
 ↓
Metadata Transaction
 ↓
Processing Job if Required
 ↓
Ready
```

Large or expensive processing must use background jobs.

---

# 26. File Security

File handling must protect against:

- Path traversal
- Malicious filenames
- Unsupported file types
- Oversized files
- Malware where applicable
- Unauthorized downloads
- Public exposure
- Processing vulnerabilities
- Cross-account access

File metadata and object permissions must remain consistent.

---

# 27. File Processing

Processing may include:

- Text extraction
- Metadata extraction
- OCR
- Chunking
- Embedding
- Search indexing
- Document conversion

Processing must occur in controlled services or workers.

Untrusted uploaded content must not execute as trusted application code.

---

# 28. Search

Shared search may operate across authorized resources.

Search must enforce the same authorization boundaries as direct resource access.

A search result must never reveal:

- Another account's resource
- Unauthorized project content
- Deleted private content
- Restricted metadata

Search indexes must be treated as derived data.

The database remains authoritative.

---

# 29. Vector Storage

Qdrant may store embeddings and retrieval indexes.

Vector records must contain sufficient scope information to enforce:

```text
Account
Project
Resource
```

Retrieval must apply authorization constraints before content is returned to the AI context.

Deleting a resource must eventually remove corresponding vector data.

---

# 30. Notifications

Notifications are shared platform resources.

Types may include:

- Trial expiration
- Subscription changes
- Export completion
- Background-job completion
- File-processing completion
- Security events
- Product-specific events

Notifications should include:

- User
- Account
- Type
- Title
- Body
- Read state
- Created timestamp
- Optional action reference

---

# 31. Email

Resend is the initial email provider.

Email sending must occur through a shared email service.

Products should request semantic email actions rather than constructing provider-specific API calls.

Examples:

```text
sendTrialEndingNotice()
sendSubscriptionConfirmation()
sendExportReadyNotice()
```

Email provider credentials remain server-side.

---

# 32. User Settings

Settings may include:

- Locale
- Time zone
- Notification preferences
- Appearance preferences
- Product preferences
- Privacy preferences where supported

Settings must be validated server-side.

Unknown or unsupported settings must not be blindly persisted.

---

# 33. Audit Logs

Audit logs provide security and operational traceability.

Examples:

- Account creation
- Authentication/security events
- Permission changes
- Subscription state changes
- Entitlement changes
- Project deletion
- File deletion
- Sensitive configuration changes

Audit logs must not become a dump of prompts, source code, legal documents, or private user content.

---

# 34. API Boundary

tRPC is the primary application API.

Use Next.js Route Handlers only for direct HTTP semantics such as:

- Billing webhooks
- Authentication callbacks
- Health endpoints
- External callbacks

Product functionality should not create competing API patterns without an architectural reason.

---

# 35. Validation

All externally supplied data must be validated.

Validation applies to:

- tRPC inputs
- Route Handler payloads
- File metadata
- Query parameters
- Form submissions
- Background job payloads
- External webhook payloads

Validation schemas should be shared where appropriate.

---

# 36. Error Model

Shared errors should use predictable categories.

Examples:

```text
UNAUTHENTICATED
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
CONFLICT
RATE_LIMITED
ENTITLEMENT_REQUIRED
TRIAL_EXPIRED
SUBSCRIPTION_REQUIRED
DEPENDENCY_FAILURE
INTERNAL_ERROR
```

Internal infrastructure details must not leak to clients.

---

# 37. Concurrency

Shared services must account for concurrent requests.

Important operations include:

- Trial creation
- Subscription updates
- Entitlement changes
- Project creation
- File writes
- Version creation
- Deletion
- Usage recording

Database constraints and transactions must be used where required.

---

# 38. Caching

Caching must never become the authoritative source for:

- Ownership
- Subscription truth
- Trial expiration
- Entitlement truth
- Security permissions

Upstash may be used for:

- Rate limits
- Temporary state
- Cacheable derived data
- Job coordination where appropriate

Cache invalidation must be deliberate.

---

# 39. Rate Limiting

Rate limits should be applied according to operation risk.

Potential dimensions:

- Account
- User
- IP
- Product
- Endpoint
- AI capability
- Upload operation

Rate limiting must not replace authorization.

A valid user can still be unauthorized for a resource.

---

# 40. Account Deletion

Account deletion must be a controlled production workflow.

It must account for:

- User identity
- Account records
- Projects
- Files
- Conversations
- Product data
- Storage objects
- Vector indexes
- Usage records
- Notifications
- Background jobs
- External integrations
- Audit retention requirements

Deletion must not be implemented as a single database row deletion if dependent data remains accessible.

---

# 41. Data Retention

Retention policies must distinguish between:

- User content
- Operational metadata
- Security audit data
- Billing records
- Derived indexes
- Temporary processing data

Retention must be documented.

Sensitive content should not be retained longer than necessary.

---

# 42. Environment Isolation

Aila must maintain separate:

```text
Development
Staging
Production
```

Each environment requires separate:

- Database
- Authentication configuration
- Storage
- AI provider configuration
- Billing configuration
- Secrets
- Monitoring configuration
- External integrations

Development credentials must never provide production access.

---

# 43. Secrets

Secrets must be stored through deployment/platform secret management.

`.env` files must never be committed.

`.env.example` documents required configuration without real secrets.

Secrets include:

- Database credentials (Supabase PostgreSQL)
- Neon Auth secrets
- AI provider keys
- Flutterwave credentials
- Storage credentials (Neon object storage)
- Email credentials
- Monitoring credentials
- Encryption keys

---

# 44. Observability

The platform must provide:

- Structured logs
- Metrics
- Error monitoring
- Correlation IDs
- Health checks
- Critical workflow monitoring
- Alerting

Sentry is the initial error monitoring system.

PostHog may be used for product analytics where appropriate.

Analytics must not capture sensitive content unnecessarily.

---

# 45. Health Checks

Production health checks should distinguish between:

- Application availability
- Database connectivity
- Required dependency availability
- Worker availability
- Queue availability

A dependency failure should not automatically expose internal diagnostics to public clients.

---

# 46. Background Jobs

Long-running shared operations should use background processing.

Examples:

- File processing
- Embedding generation
- Export generation
- Notifications
- Email
- Large AI jobs
- Cleanup

Jobs must include:

- Stable ID
- Status
- Attempts
- Error state
- Created timestamp
- Updated timestamp
- Retry policy

---

# 47. Security Boundaries

The shared platform must maintain explicit boundaries between:

```text
Browser
    ↓
Application
    ↓
Database
    ↓
Storage
    ↓
AI Providers
    ↓
External Services
```

No client may directly cross a trusted server boundary without appropriate authorization.

---

# 48. Production Testing

The platform requires:

### Unit Tests

For:

- Entitlement resolution
- Trial calculations
- Authorization
- Validation
- File policies
- Error mapping

### Integration Tests

For:

- Authentication
- Account creation
- Trial lifecycle
- Subscription lifecycle
- Entitlements
- Project ownership
- File access
- Storage
- Notifications
- Usage

### End-to-End Tests

For:

- Registration
- Trial activation
- Product access
- Trial expiration
- Subscription activation
- Project creation
- File upload
- Account deletion

### Security Tests

For:

- Cross-account access
- Authorization bypass
- File exposure
- Trial bypass
- Entitlement bypass
- Webhook forgery
- Path traversal
- Secret leakage

---

# 49. Production Acceptance Criteria

The platform foundation is accepted only when:

- Authentication works reliably.
- Accounts are created consistently.
- Account ownership is enforced.
- Authorization is server-side.
- Trial state is server-authoritative.
- Trial duration is exactly three hours.
- Expired trials cannot regain access without valid entitlement.
- Subscription state is synchronized safely.
- Billing events are authenticated and idempotent.
- Entitlements are centralized.
- Usage is recorded centrally.
- Projects are account-scoped.
- Project permissions are enforced.
- Files are private by default.
- File access is authorization-controlled.
- Storage objects cannot bypass application authorization.
- Search respects permissions.
- Vector retrieval respects permissions.
- Notifications work reliably.
- Account deletion is implemented and tested.
- Sensitive content is not unnecessarily logged.
- Production secrets are protected.
- Environment separation is enforced.
- Required automated tests pass.
- Security tests pass.
- Monitoring covers critical workflows.
- Backup and recovery procedures are documented and tested.

---

# 50. Critical Release Blockers

The platform must not ship if any of these exists:

- Authentication bypass
- Authorization bypass
- Cross-account data access
- Public private files
- Trial bypass
- Entitlement bypass
- Forged billing webhook acceptance
- Subscription corruption
- Exposed secrets
- Production/dev environment credential crossover
- Broken account deletion
- Unauthorized vector retrieval
- Critical data corruption
- Missing production monitoring
- Untested recovery procedure
- Critical security vulnerability

---

# 51. Platform Invariants

The following must always remain true:

1. Aila has one account and identity model.
2. Authentication is centralized.
3. Authorization is server-side.
4. Trial state is server-authoritative.
5. Subscription state is centrally represented.
6. Entitlements are centrally resolved.
7. Usage is centrally tracked.
8. Projects are account-scoped.
9. Files are private by default.
10. Storage is not an authorization authority.
11. Search cannot bypass authorization.
12. Vector retrieval cannot bypass authorization.
13. AI providers are accessed through the AI Gateway.
14. Billing providers are accessed through the Billing Service.
15. Secrets remain server-side.
16. Production and non-production environments remain isolated.
17. PostgreSQL remains the authoritative transactional source of truth.
18. Derived systems can be rebuilt from authoritative data.
19. Security-critical failures block release.
20. No product may silently implement a competing version of a shared platform capability.

---

# 52. Production Definition of Done

The Platform Foundation is complete only when every shared capability required by the six products is implemented against the production architecture.

Completion requires:

- Identity
- Authentication
- Accounts
- Authorization
- Trial
- Subscription integration
- Entitlements
- Usage
- Projects
- Membership
- Files
- Storage
- Search
- Vector indexing boundaries
- Notifications
- Email
- Settings
- Audit logs
- Background jobs
- Validation
- Error handling
- Rate limiting
- Observability
- Security controls
- Automated tests
- Account deletion
- Backup/recovery readiness
- Environment isolation
- Operational documentation

A UI demonstration does not constitute completion.

A feature is production-ready only when its server-side behavior, persistence, authorization, security, testing, monitoring, failure handling, and operational requirements are complete.