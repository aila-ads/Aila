# Aila V1 Database Schema Specification

**Product:** Aila  
**Release:** V1.0  
**Status:** Production Specification  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Authority:** Prisma schema + Prisma migrations

---

# 1. Purpose

This document defines the authoritative transactional data model for Aila V1.

PostgreSQL is the source of truth for:

- Accounts
- Users
- Memberships
- Trials
- Subscriptions
- Entitlements
- Usage
- Projects
- Files
- Conversations
- Messages
- Notifications
- Settings
- Audit records
- Product-specific persistent state

Derived systems such as:

- Qdrant
- Upstash
- Search indexes
- Analytics systems
- Object storage

must never become the authoritative source for transactional state.

---

# 2. Database Authority

The production database is PostgreSQL.

Prisma is the application database layer.

Prisma migrations are authoritative.

There must not be:

- A second migration system
- Hand-maintained production schema SQL competing with Prisma
- Separate production databases for individual products
- Product-specific database sources of truth

---

# 3. Primary Identifier

Persistent application entities use UUID identifiers unless a specific technical requirement justifies another identifier.

Identifiers must be generated server-side.

Clients must not choose ownership relationships by submitting arbitrary account IDs.

**Implementation note:**
- Every model's `id` uses `@default(uuid(7))`. Prisma generates time-ordered UUIDv7 values on the server, at insert time.
- Columns stay `TEXT` (Prisma `String`), not `@db.Uuid`. Rows created before this change keep their original cuid ids (e.g. `clx…`), and a native `uuid` column could not store them.
- Changing the default needs no SQL migration, because Prisma applies `uuid()`/`cuid()` defaults in the client, not in the database.
- Code must treat ids as opaque strings. Validate them as non-empty strings of bounded length, not with UUID- or cuid-specific patterns, because both formats can occur.

---

# 4. Common Record Fields

Persistent records should generally include:

```text
id
createdAt
updatedAt
```

Where applicable:

```text
deletedAt
```

Soft deletion must only be used where it provides a defined product or operational benefit.

It must not be used merely to avoid implementing proper deletion behavior.

---

# 5. Core Entity Map

The foundational model is:

```text
Account
├── User
├── Membership
├── Trial
├── Subscription
├── Entitlement
├── UsageRecord
├── Project
│   ├── ProjectMember
│   ├── Folder
│   ├── File
│   │   └── FileVersion
│   └── Product Data
├── Conversation
│   └── Message
├── Notification
├── Setting
└── AuditLog
```

---

# 6. Account

`Account` is the primary ownership boundary.

Conceptual fields:

```text
id
name
slug where required
status
createdAt
updatedAt
deletedAt where required
```

An account may own:

- Projects
- Files
- Conversations
- Subscription
- Trial
- Usage
- Product data

---

# 7. User

`User` represents the Aila application identity associated with the authentication system.

Conceptual fields:

```text
id
authUserId
accountId
displayName
avatarUrl/reference
locale
timezone
createdAt
updatedAt
```

`authUserId` must map safely to the external authentication identity.

The application must not duplicate passwords or authentication secrets.

---

# 8. Account Membership

Where multiple users per account are supported, membership must be explicit.

Conceptual model:

```text
AccountMembership
├── accountId
├── userId
├── role
├── createdAt
└── updatedAt
```

Roles must be centrally defined.

Suggested initial roles:

```text
OWNER
MEMBER
```

Additional roles should not be introduced until required.

---

# 9. Trial

An account has at most one initial trial.

Conceptual model:

```text
Trial
├── id
├── accountId
├── status
├── startedAt
├── expiresAt
├── endedAt
├── createdAt
└── updatedAt
```

`accountId` must have a uniqueness constraint if only one trial is permitted.

---

# 10. Trial Status

Suggested statuses:

```text
ACTIVE
EXPIRED
ENDED
CANCELLED
```

The exact set must match the implemented lifecycle.

A trial is active only when the server-authoritative state and timestamps permit access.

---

# 11. Trial Integrity

Database/application invariants:

- One trial per eligible account.
- `expiresAt > startedAt`.
- Active trial must have a valid expiration.
- Ended trial cannot become active through client input.
- Trial creation is protected against duplicate concurrent creation.

---

# 12. Subscription

Conceptual model:

```text
Subscription
├── id
├── accountId
├── provider
├── providerCustomerId
├── providerSubscriptionId
├── plan
├── status
├── currentPeriodStart
├── currentPeriodEnd
├── cancelAtPeriodEnd
├── canceledAt
├── createdAt
└── updatedAt
```

Provider identifiers should have appropriate uniqueness constraints.

---

# 13. Subscription Provider

Initial provider:

```text
FLUTTERWAVE
```

Provider-specific details must remain behind the Billing Service.

The database stores provider references but product code must not depend directly on provider implementation.

---

# 14. Subscription Status

The application must define a controlled status model.

Possible values include:

```text
PENDING
ACTIVE
PAST_DUE
CANCELLED
EXPIRED
FAILED
```

The final values must correspond to the billing integration's actual state machine.

---

# 15. Billing Events

Webhook processing requires durable idempotency records.

Conceptual model:

```text
BillingEvent
├── id
├── provider
├── providerEventId
├── eventType
├── status
├── receivedAt
├── processedAt
├── errorCode
└── createdAt
```

`provider + providerEventId` must be unique.

Duplicate webhook delivery must not produce duplicate subscription mutations.

---

# 16. Entitlement

Entitlements represent effective product capabilities.

Conceptual model:

```text
Entitlement
├── id
├── accountId
├── key
├── status
├── source
├── startsAt
├── expiresAt
├── createdAt
└── updatedAt
```

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

---

# 17. Entitlement Resolution

The database may persist entitlement state, but the effective entitlement must be resolved through the centralized entitlement service.

Possible sources:

```text
TRIAL
SUBSCRIPTION
ADMIN
SYSTEM
```

Product code must not derive entitlement independently.

---

# 18. UsageRecord

Usage records provide centralized accounting.

Conceptual fields:

```text
UsageRecord
├── id
├── accountId
├── userId
├── product
├── operation
├── model
├── provider
├── requestId
├── inputTokens
├── outputTokens
├── totalTokens
├── estimatedCost
├── durationMs
├── status
└── createdAt
```

The exact fields depend on provider capabilities.

---

# 19. Usage Privacy

Usage records must not contain unnecessary:

- Prompt bodies
- AI responses
- Source code
- Legal documents
- Credentials
- Private uploaded content

Usage accounting is not a conversation archive.

---

# 20. Project

`Project` is the shared organizational boundary.

Conceptual fields:

```text
Project
├── id
├── accountId
├── ownerUserId
├── product
├── name
├── description
├── status
├── createdAt
├── updatedAt
└── deletedAt
```

The `product` field identifies the owning product context where appropriate.

---

# 21. Project Product

Allowed product values:

```text
INTELLIGENCE
WRITER
TRANSLATE
ADS
LEGAL
CODING
```

Product values must use a controlled enum or equivalent validated representation.

---

# 22. Project Membership

Conceptual model:

```text
ProjectMember
├── id
├── projectId
├── userId
├── role
├── createdAt
└── updatedAt
```

Unique constraint:

```text
(projectId, userId)
```

A project member cannot be duplicated.

---

# 23. Project Roles

Initial roles:

```text
OWNER
EDITOR
VIEWER
```

Authorization must use these roles consistently.

---

# 24. Folder

Folders organize project resources.

Conceptual model:

```text
Folder
├── id
├── projectId
├── parentFolderId
├── name
├── path metadata where required
├── createdAt
└── updatedAt
```

Parent relationships must not allow cycles.

---

# 25. File

Files are logical resources.

Conceptual fields:

```text
File
├── id
├── accountId
├── projectId
├── folderId
├── ownerUserId
├── name
├── path
├── mimeType
├── extension
├── sizeBytes
├── storageProvider
├── storageObjectKey
├── status
├── createdAt
├── updatedAt
└── deletedAt
```

The database stores metadata and storage references.

Binary data belongs in object storage.

---

# 26. File Status

Possible states:

```text
UPLOADING
PROCESSING
READY
FAILED
DELETED
```

The final state machine must reflect actual implementation.

---

# 27. File Version

Version history is required where the product needs persistent versioning.

Conceptual model:

```text
FileVersion
├── id
├── fileId
├── versionNumber
├── storageObjectKey/content reference
├── createdByUserId
├── source
├── createdAt
```

Possible sources:

```text
USER
AI
RESTORE
SYSTEM
```

A restored version should create a new version rather than deleting history.

---

# 28. File Constraints

The application must enforce:

- File belongs to one account.
- File belongs to one authorized project.
- Folder belongs to the same project.
- Storage object is private.
- Paths are normalized.
- Duplicate path conflicts are handled safely.
- Deleted files cannot be accessed through normal APIs.

---

# 29. Conversation

Conversations are shared primarily for Aila Intelligence and other product workflows that require conversational interaction.

Conceptual model:

```text
Conversation
├── id
├── accountId
├── userId
├── projectId
├── product
├── title
├── status
├── createdAt
└── updatedAt
```

---

# 30. Message

Conceptual model:

```text
Message
├── id
├── conversationId
├── role
├── status
├── content/reference
├── model
├── provider
├── createdAt
└── updatedAt
```

Possible roles:

```text
USER
ASSISTANT
SYSTEM
TOOL
```

Internal system/tool messages must not be exposed to users unless intentionally designed for that purpose.

---

# 31. Message Content

Message storage must be designed around privacy.

The database may store conversation content when required by product functionality.

However:

- Usage telemetry must not duplicate it unnecessarily.
- Analytics must not capture it.
- Logs must not indiscriminately capture it.
- External providers must receive only necessary context.

---

# 32. Notification

Conceptual model:

```text
Notification
├── id
├── accountId
├── userId
├── type
├── title
├── body
├── readAt
├── actionType
├── actionReference
├── createdAt
└── updatedAt
```

Notifications are application data, not analytics events.

---

# 33. User Settings

Conceptual model:

```text
UserSettings
├── id
├── userId
├── locale
├── timezone
├── preferences JSON
├── createdAt
└── updatedAt
```

Structured settings should be normalized into explicit columns when they become important to querying or authorization.

Arbitrary JSON must not become a replacement for schema design.

---

# 34. AuditLog

Audit logs provide security and operational traceability.

Conceptual fields:

```text
AuditLog
├── id
├── accountId
├── userId
├── action
├── resourceType
├── resourceId
├── result
├── requestId
├── metadata
└── createdAt
```

Metadata must not contain unrestricted sensitive content.

---

# 35. Product-Specific Data

Product-specific models must remain separated from shared foundation models.

Examples:

```text
Writer
├── WriterProject
├── WriterDocument
├── WriterChapter
├── WriterVersion
└── WriterReference

Translate
├── Translation
├── TranslationRevision
├── TranslationMemory
└── TranslationReference

Ads
├── AdCampaign
├── AdVariation
├── AdCreativeBrief
└── AdAnalysis

Legal
├── LegalDocument
├── LegalAnalysis
├── LegalIssue
├── LegalCitation
└── LegalReport

Coding
├── CodingProject
├── CodingFile
├── CodingFolder
├── CodingFileVersion
├── CodingChange
└── CodingJob
```

The exact final model names must be reconciled before migration creation.

---

# 36. Writer Data

Writer-specific records must support:

- Books/projects
- Documents
- Chapters
- Sections
- Version history
- References
- Writing metadata
- Export jobs

Writer content must remain account/project scoped.

---

# 37. Translate Data

Translate-specific records must support:

- Source text
- Translation
- Source language
- Target language
- Revision history
- Terminology
- Translation memory where enabled
- Document processing state

Translation data must remain account/project scoped.

---

# 38. Ads Data

Ads-specific records must support:

- Campaign
- Platform
- Objective
- Audience
- Offer
- Messaging
- Creative concepts
- Variations
- Performance input
- Analysis

User-provided performance data must be distinguishable from AI-generated analysis.

---

# 39. Legal Data

Legal-specific records must support:

- Legal documents
- Jurisdiction
- Context
- Analyses
- Issues
- Clauses
- Definitions
- Sources
- Citations
- Reports

Legal data requires especially strong access controls and privacy handling.

---

# 40. Coding Data

Coding-specific records must support:

- Coding projects
- Files
- Folders
- File versions
- AI changes
- Change review
- Jobs
- Project instructions

Coding source code must remain account/project scoped.

---

# 41. AI Change Records

Where AI creates persistent changes, the system should maintain sufficient metadata to distinguish:

```text
USER_CHANGE
AI_PROPOSAL
AI_APPLIED
RESTORE
SYSTEM
```

AI proposals should remain reviewable before application.

---

# 42. AI Request Correlation

AI operations must have a stable request identifier.

The request identifier may connect:

```text
AI Request
 ↓
Usage Record
 ↓
Audit/Operational Record
 ↓
Product Result
```

It must not require storing sensitive prompt contents in every record.

---

# 43. Indexing

Indexes must support common authorization and lookup paths.

Important combinations include:

```text
accountId
accountId + createdAt
accountId + updatedAt
projectId
projectId + createdAt
userId
conversationId
fileId
status
```

Product-specific indexes must be designed from actual query patterns.

Indexes should not be added indiscriminately.

---

# 44. Unique Constraints

Important uniqueness rules include:

```text
AccountMembership(accountId, userId)
ProjectMember(projectId, userId)
BillingEvent(provider, providerEventId)
Entitlement(accountId, key)
```

Additional uniqueness constraints must be added wherever business invariants require them.

---

# 45. Foreign Keys

Foreign keys must be used for relationships that require database-level integrity.

Examples:

```text
User → Account
Trial → Account
Subscription → Account
Project → Account
File → Project
FileVersion → File
Message → Conversation
Notification → User
```

Deletion behavior must be explicitly selected.

Do not rely on accidental database defaults.

---

# 46. Deletion Strategy

Each relation must have a deliberate deletion policy:

- Cascade
- Restrict
- Set null
- Soft deletion
- Explicit service-managed deletion

Sensitive user data requires special care.

Deleting an account must not accidentally leave accessible derived data.

---

# 47. Derived Data

The following are derived systems:

- Qdrant vectors
- Search indexes
- Caches
- Analytics
- Object processing artifacts

Derived data must be rebuildable or cleanly invalidated where practical.

The database remains authoritative.

---

# 48. Transactional Invariants

Transactions are required where partial completion could corrupt state.

Examples:

### Account + Trial

Account creation and initial trial creation must not produce an account without its intended trial state.

### Subscription + Entitlements

Subscription state changes and entitlement updates must remain consistent.

### File Metadata

File metadata transitions must remain consistent with processing state.

### Version Creation

New versions must not create duplicate or ambiguous version numbers.

---

# 49. Concurrency

The schema and services must handle concurrent requests.

Examples:

- Two simultaneous trial creation attempts
- Two simultaneous file saves
- Two simultaneous subscription webhook deliveries
- Two simultaneous version writes
- Two simultaneous deletion requests

Use:

- Unique constraints
- Transactions
- Appropriate locking
- Optimistic version checks

where required.

---

# 50. Migration Rules

Every production schema change must:

1. Modify `schema.prisma`.
2. Generate a Prisma migration.
3. Review the migration.
4. Test against a representative database.
5. Validate backward compatibility where deployment requires it.
6. Apply through the deployment migration process.

No manual production schema edits should become an undocumented source of truth.

---

# 51. Migration Safety

Migrations must consider:

- Existing data
- Large tables
- Lock duration
- Index creation
- Nullable-to-required changes
- Backfills
- Roll-forward strategy
- Deployment ordering

Destructive changes require explicit review.

---

# 52. Environment Separation

Each environment has a separate database.

```text
Development DB
Staging DB
Production DB
```

Credentials must never cross environments.

Production data must not be copied into development without an approved privacy-safe process.

---

# 53. Backup and Recovery

The production PostgreSQL database requires:

- Automated backups
- Retention policy
- Recovery procedure
- Recovery testing
- Documented ownership
- Restore verification

A backup that has never been restored is not sufficient evidence of recoverability.

---

# 54. Database Security

Database access must use:

- Least privilege
- TLS where supported
- Secure credentials
- Environment separation
- Restricted network access
- Monitoring
- Rotation procedures

The browser never receives database credentials.

---

# 55. Production Acceptance Criteria

The database layer is accepted only when:

- Prisma schema represents the authoritative model.
- Prisma migrations are reproducible.
- Account ownership is enforceable.
- User/account relationships are consistent.
- Trial state is persistent and authoritative.
- Subscription state is persistent and auditable.
- Billing events are idempotent.
- Entitlements are centrally represented.
- Usage is centrally represented.
- Projects are account-scoped.
- Project membership is enforced.
- Files are private.
- File metadata and storage references remain consistent.
- Conversation data is properly scoped.
- Product-specific data is isolated.
- Foreign keys protect required relationships.
- Unique constraints protect business invariants.
- Concurrency cases are tested.
- Account deletion is tested.
- Backup and restore are tested.
- Cross-account access tests pass.

---

# 56. Critical Database Release Blockers

Do not release if:

- Account data can cross boundaries.
- Trial state can be manipulated from the client.
- Subscription state can be forged.
- Billing events can be processed twice.
- Entitlements can be bypassed.
- Private files can be accessed without authorization.
- Vector records cannot be scoped correctly.
- Deletion leaves accessible private content.
- Migrations are not reproducible.
- Production schema differs from repository schema without documentation.
- Backups cannot be restored.
- Critical referential integrity is missing.
- Concurrent operations can corrupt authoritative state.

---

# 57. Permanent Database Invariants

1. PostgreSQL is authoritative.
2. Prisma schema is authoritative at the application layer.
3. Prisma migrations are authoritative for schema changes.
4. Every account-owned resource has an explicit ownership path.
5. Resource identifiers never grant authorization.
6. Trial state is server/database authoritative.
7. Subscription state is server/database authoritative.
8. Entitlements are centrally resolved.
9. Usage is centrally recorded.
10. Derived systems never replace PostgreSQL.
11. Private files remain private.
12. Cross-account access is prohibited.
13. Product data remains account/project scoped.
14. Sensitive content is not copied into operational records unnecessarily.
15. Deletion and retention are deliberate.
16. Concurrency is explicitly handled.
17. Production and non-production databases remain separate.
18. Recoverability must be tested, not assumed.

---

# 58. Final Database Principle

The Aila database must be boring, authoritative, predictable, and recoverable.

It must provide a stable foundation for all six products without allowing any product to create a competing source of truth.

Every schema decision must support:

- Data ownership
- Security
- Integrity
- Privacy
- Concurrency
- Recovery
- Observability
- Long-term maintainability

The database is infrastructure for the product—not a shortcut around the product architecture.