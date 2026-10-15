# Aila v1.0 Data Architecture

**Product:** Aila  
**Version:** v1.0  
**Status:** Production specification  
**Database:** PostgreSQL via Supabase  
**Authentication:** Neon Auth (Managed Better Auth)  
**Object storage:** Neon object storage (S3-compatible)  
**ORM:** Prisma  
**Primary authority:** PostgreSQL

---

# 1. Purpose

This document defines the production data architecture for Aila v1.0.

PostgreSQL is the authoritative source of truth for durable application state.

The data architecture must provide:

- Strong user isolation
- Explicit ownership
- Referential integrity
- Reliable subscription state
- Three-hour trial state
- Centralized entitlements
- Product-specific data models
- Usage tracking
- Auditability
- Safe deletion
- Production indexing
- Predictable transactions
- Future extensibility

No product may create an independent database that duplicates Aila's authoritative application state.

---

# 2. Data Architecture

```text
                         AILA ACCOUNT
                              │
                 ┌────────────┴────────────┐
                 │                         │
              Identity                  Account
                 │                         │
                 ▼                         ▼
             Neon Auth              PostgreSQL Account
                                           │
             ┌─────────────────────────────┼─────────────────────────────┐
             │                             │                             │
             ▼                             ▼                             ▼
          Billing                    Entitlements                    Settings
             │                             │
             ▼                             ▼
       Subscription                    Usage
                                           │
                                           ▼
                                       Projects
                                           │
                ┌──────────────────────────┼──────────────────────────┐
                │                          │                          │
                ▼                          ▼                          ▼
             Files                  Conversations               Product Data
                                                                      │
                      ┌───────────────┬──────────────┬─────────────────┤
                      ▼               ▼              ▼
                    Writer         Translate        Ads
                      │               │              │
                      ▼               ▼              ▼
                    Legal          Coding        Reports
```

---

# 3. Database Authority

PostgreSQL is authoritative for:

- Accounts
- Users
- Trial state
- Subscription state
- Entitlements
- Projects
- Files metadata
- Conversations
- Messages
- Product records
- Usage
- Notifications
- Settings
- Audit records

Other infrastructure has specialized responsibilities.

### Neon Object Storage

Stores binary files in the private bucket `storage`.

### Qdrant

Stores vector representations and search indexes.

### Upstash Redis

Stores temporary/cache/rate-limit data.

These systems must not replace PostgreSQL as the source of transactional truth.

---

# 4. Identity Model

Neon Auth (Managed Better Auth) manages authentication identities.

Aila PostgreSQL stores the application account associated with the authenticated identity.

Conceptually:

```text
Neon Auth User
        │
        │ 1:1
        ▼
Aila Account
        │
        ├── Profile
        ├── Subscription
        ├── Trial
        ├── Projects
        ├── Files
        ├── Usage
        ├── Notifications
        └── Settings
```

The authentication provider identifier (the Neon Auth user ID) must be stored as an external identity reference.

Neon Auth and the Supabase PostgreSQL database are separate systems, so this reference is not a database foreign key.

Aila must not duplicate authentication credentials in PostgreSQL.

---

# 5. Core Tables

The production database contains the following primary domains.

```text
accounts
users / profiles
subscriptions
trials
entitlements
usage_records
projects
project_members
folders
files
conversations
messages
notifications
settings
audit_logs
```

Product domains:

```text
writer_books
writer_chapters
writer_versions

translations
translation_history

campaigns
campaign_reports

legal_documents
legal_analyses

coding_projects
coding_sessions
```

Additional supporting tables may be introduced when required by a production feature.

---

# 6. Accounts

The account is the primary ownership boundary.

Conceptual fields:

```text
accounts
├── id
├── auth_user_id
├── email
├── display_name
├── avatar_url
├── role
├── created_at
└── updated_at
```

Requirements:

- `id` is a UUID.
- `auth_user_id` is unique.
- Account ownership is explicit.
- Creation timestamps are mandatory.
- Update timestamps are maintained for mutable records.
- Email uniqueness is enforced where applicable.

---

# 7. Roles

Aila v1.0 supports at least:

```text
user
admin
```

Role values are controlled by the backend.

A client must never be allowed to assign itself an administrative role.

Administrative authorization must be enforced server-side.

---

# 8. Three-Hour Trial

Trial state is stored explicitly.

Conceptual model:

```text
trials
├── id
├── account_id
├── started_at
├── expires_at
├── ended_at
├── status
├── created_at
└── updated_at
```

Possible states:

```text
active
expired
ended
```

The exact state transition rules are defined by the application service.

---

# 9. Trial Rules

A trial begins when an eligible account receives trial access.

The server determines whether a trial is active.

The trial duration is exactly three hours.

The client must never determine trial expiration independently.

The authoritative check is conceptually:

```text
current server time < trial.expires_at
```

The application must additionally validate the stored trial status.

Trial expiration must not delete user data.

---

# 10. Trial Uniqueness

A production account must not receive unlimited repeated trials through repeated account state changes.

The system must enforce the intended trial policy at the account level.

Trial creation must be idempotent.

The application must not create duplicate active trials for the same account.

---

# 11. Subscriptions

Conceptual model:

```text
subscriptions
├── id
├── account_id
├── provider
├── provider_customer_id
├── provider_subscription_id
├── plan
├── status
├── current_period_start
├── current_period_end
├── cancel_at_period_end
├── canceled_at
├── created_at
└── updated_at
```

Initial provider:

```text
flutterwave
```

Initial plan:

```text
pro
```

---

# 12. Subscription States

The application must support provider lifecycle states such as:

```text
pending
active
past_due
canceled
expired
failed
```

The final mapping from Flutterwave states to Aila states is defined in the Billing Service.

Provider-specific status values must not leak throughout the application.

---

# 13. Subscription Authority

The Billing Service owns subscription state transitions.

The client cannot activate Pro access by submitting:

```text
plan = "pro"
```

or similar client-controlled values.

Pro access is granted only when the authoritative subscription state satisfies the entitlement rules.

---

# 14. Billing Webhook Idempotency

Billing webhooks must be safely repeatable.

The system must maintain a record of processed provider events or an equivalent idempotency mechanism.

A repeated webhook must not:

- Create duplicate subscriptions
- Duplicate payments
- Duplicate entitlements
- Duplicate audit records unnecessarily
- Corrupt subscription periods

---

# 15. Entitlements

Entitlements determine what an account may use.

The entitlement system is separate from raw subscription records.

Conceptual structure:

```text
entitlements
├── id
├── account_id
├── key
├── value
├── source
├── created_at
└── updated_at
```

Alternatively, entitlements may be resolved from subscription/trial policy without storing every entitlement as a physical row.

The implementation must maintain one authoritative entitlement service.

---

# 16. Entitlement Examples

Possible entitlement keys:

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

Entitlements may also represent limits:

```text
max_projects
max_file_size
monthly_ai_usage
advanced_model_access
```

The exact limits are defined separately from the architecture.

---

# 17. Entitlement Resolution

Conceptually:

```text
Request
   ↓
Authenticated Account
   ↓
Trial / Subscription State
   ↓
Entitlement Service
   ↓
Allowed / Denied
   ↓
Product Service
```

The frontend may display entitlement state but cannot enforce it as the only security mechanism.

---

# 18. Projects

Projects provide an organizational boundary for user work.

Conceptual model:

```text
projects
├── id
├── account_id
├── name
├── description
├── product_type
├── created_at
└── updated_at
```

Possible product types:

```text
intelligence
writer
translate
ads
legal
coding
```

A project belongs to one owning account unless explicit collaboration is introduced.

---

# 19. Project Members

The schema supports explicit collaboration through:

```text
project_members
├── id
├── project_id
├── account_id
├── role
├── created_at
└── updated_at
```

Possible roles:

```text
owner
editor
viewer
```

Collaboration is only enabled where the product requirements permit it.

Ownership and membership must never be inferred from client state.

---

# 20. Folders

Folders provide organizational structure for files and project resources where required.

Conceptual model:

```text
folders
├── id
├── account_id
├── project_id
├── parent_folder_id
├── name
├── created_at
└── updated_at
```

Nested folders must not create unrestricted recursive queries.

Production limits and validation must be applied.

---

# 21. Files

PostgreSQL stores file metadata.

Binary content is stored in Neon object storage (S3-compatible, branch-scoped), in the private bucket `storage`.

Conceptual model:

```text
files
├── id
├── account_id
├── project_id
├── folder_id
├── storage_bucket
├── storage_key
├── original_name
├── mime_type
├── size_bytes
├── checksum
├── status
├── created_at
└── updated_at
```

Possible processing states:

```text
uploaded
processing
ready
failed
deleted
```

---

# 22. File Ownership

Every private file must have an explicit account relationship.

Storage paths must not rely solely on user-provided filenames.

A secure pattern is:

```text
/account/{account_id}/project/{project_id}/file/{file_id}
```

The actual storage key may use a different implementation, but ownership must remain unambiguous.

---

# 23. File Security

Private files must not be publicly accessible.

File access requires:

1. Authentication
2. Ownership or membership verification
3. Entitlement verification where applicable
4. Secure storage access

Signed URLs may be generated for controlled access where appropriate.

---

# 24. Conversations

Conversations belong to an account and may optionally belong to a project.

Conceptual model:

```text
conversations
├── id
├── account_id
├── project_id
├── product_type
├── title
├── created_at
└── updated_at
```

A conversation cannot be accessed merely by knowing its ID.

Authorization is required for every retrieval and mutation.

---

# 25. Messages

Conceptual model:

```text
messages
├── id
├── conversation_id
├── role
├── content
├── model
├── metadata
├── created_at
└── updated_at
```

Possible roles:

```text
user
assistant
system
tool
```

The exact role model is controlled by the AI application layer.

Sensitive content must not be duplicated unnecessarily in logs.

---

# 26. Conversation Data

Conversation content is application data.

It is separate from:

- Operational logs
- Error logs
- Analytics events
- Audit logs
- AI provider telemetry

This separation reduces accidental exposure of sensitive user content.

---

# 27. Aila Writer Data

## Books

```text
writer_books
├── id
├── account_id
├── project_id
├── title
├── description
├── created_at
└── updated_at
```

## Chapters

```text
writer_chapters
├── id
├── book_id
├── title
├── content
├── chapter_number
├── created_at
└── updated_at
```

## Versions

```text
writer_versions
├── id
├── chapter_id
├── version_number
├── content
├── created_at
└── created_by
```

Version history must preserve prior versions without overwriting them.

---

# 28. Aila Translate Data

Conceptual model:

```text
translations
├── id
├── account_id
├── project_id
├── source_language
├── target_language
├── source_content
├── translated_content
├── status
├── created_at
└── updated_at
```

History:

```text
translation_history
├── id
├── translation_id
├── source_content
├── translated_content
├── created_at
```

Large documents may use file references and processing jobs rather than storing all content in one database field.

---

# 29. Aila Ads Data

Campaign model:

```text
campaigns
├── id
├── account_id
├── project_id
├── campaign_name
├── platform
├── objective
├── audience
├── budget
├── status
├── created_at
└── updated_at
```

Reports:

```text
campaign_reports
├── id
├── campaign_id
├── report_type
├── content
├── metadata
├── created_at
└── updated_at
```

Platform-specific identifiers are optional until official integrations are implemented.

---

# 30. Aila Legal Data

Documents:

```text
legal_documents
├── id
├── account_id
├── project_id
├── file_id
├── title
├── jurisdiction
├── document_type
├── created_at
└── updated_at
```

Analyses:

```text
legal_analyses
├── id
├── legal_document_id
├── summary
├── findings
├── risks
├── recommendations
├── citations
├── uncertainty
├── created_at
└── updated_at
```

Legal data requires stricter access controls and deliberate auditability.

---

# 31. Aila Coding Data

Coding projects:

```text
coding_projects
├── id
├── account_id
├── project_id
├── title
├── description
├── created_at
└── updated_at
```

Coding sessions:

```text
coding_sessions
├── id
├── coding_project_id
├── prompt
├── response
├── metadata
├── created_at
└── updated_at
```

Source files may be represented through the common file system or a dedicated code-file model when required.

---

# 32. Usage Records

Usage records support:

- AI usage
- Cost control
- Product analytics
- Limits
- Billing analysis
- Operational monitoring

Conceptual model:

```text
usage_records
├── id
├── account_id
├── product_type
├── provider
├── model
├── request_type
├── input_tokens
├── output_tokens
├── total_tokens
├── estimated_cost
├── duration_ms
├── status
└── created_at
```

Usage records should be append-oriented.

Corrections should create traceable adjustments rather than silently rewriting historical usage.

---

# 33. Usage and Limits

Usage enforcement occurs through the entitlement and usage services.

Conceptually:

```text
AI Request
   ↓
Authentication
   ↓
Entitlement
   ↓
Usage Check
   ↓
AI Gateway
   ↓
Provider
   ↓
Usage Record
```

The exact limits are product/business configuration and must not be hardcoded throughout product code.

---

# 34. Notifications

Conceptual model:

```text
notifications
├── id
├── account_id
├── type
├── title
├── body
├── read_at
├── created_at
└── metadata
```

Notifications may be:

- In-app
- Email
- Billing-related
- Security-related
- Product-related

Sensitive information should not be unnecessarily included in notification previews.

---

# 35. Settings

Settings belong to the account.

Conceptual model:

```text
settings
├── id
├── account_id
├── key
├── value
├── created_at
└── updated_at
```

Sensitive credentials must never be stored as ordinary user settings.

Secret values belong in secure secret management systems.

---

# 36. Audit Logs

Audit logs record important security and administrative events.

Conceptual model:

```text
audit_logs
├── id
├── account_id
├── actor_type
├── action
├── resource_type
├── resource_id
├── metadata
├── created_at
└── ip_hash_or_reference
```

Audit records should contain enough information to investigate important events without unnecessarily storing sensitive document or conversation contents.

---

# 37. Data Isolation

Every query involving account-owned data must be scoped to the authenticated account.

Unsafe:

```text
SELECT * FROM projects WHERE id = :project_id;
```

Required conceptual behavior:

```text
SELECT *
FROM projects
WHERE id = :project_id
AND account_id = :authenticated_account_id;
```

For membership-based resources, authorization is resolved through explicit membership.

---

# 38. Database Constraints

Production schema must use database constraints where appropriate.

Examples:

- Primary keys
- Foreign keys
- Unique constraints
- Not-null constraints
- Check constraints
- Appropriate default values

Application validation is required in addition to database constraints.

The database must not rely solely on frontend validation.

---

# 39. Foreign Keys

Relationships must use explicit foreign keys.

Examples:

```text
account
  ↓
project
  ↓
conversation
  ↓
message
```

and:

```text
account
  ↓
project
  ↓
file
```

Foreign-key behavior must be deliberately selected.

Cascade deletion must never be enabled casually for sensitive or high-value data.

---

# 40. Deletion Strategy

Aila must define deletion behavior per domain.

Potential strategies include:

- Soft deletion
- Hard deletion
- Cascading deletion
- Anonymization

The strategy must account for:

- User expectations
- Legal requirements
- Audit requirements
- Billing requirements
- Storage cleanup
- Vector cleanup
- Backup retention

Deleting a PostgreSQL record must not leave orphaned private files or vector data indefinitely.

---

# 41. Cross-System Deletion

When a resource is deleted, associated external data must be considered.

Example:

```text
Delete File
   │
   ├── PostgreSQL metadata
   ├── Neon object storage object
   └── Qdrant vectors
```

Cleanup must be reliable and observable.

Where immediate multi-system deletion is not possible, the system must maintain a durable cleanup process.

---

# 42. Vector Data Ownership

Every vector record must be associated with enough metadata to enforce authorization.

Conceptually:

```text
vector
├── account_id
├── project_id
├── source_type
├── source_id
└── embedding
```

A vector search must always be filtered by the appropriate account/project scope.

No global search across private user data is permitted.

---

# 43. Redis Data

Redis is temporary infrastructure.

Appropriate data:

- Rate limits
- Short-lived cache
- Temporary locks
- Ephemeral coordination

Redis must not be used as the authoritative store for:

- Accounts
- Subscriptions
- Trial state
- Projects
- Files
- Conversations
- Legal documents
- Billing records

---

# 44. Timestamps

Persistent records should use consistent timestamps.

Required convention:

- UTC in storage
- Server-generated timestamps
- ISO-compatible application representation

User-facing display may convert timestamps into the user's local timezone.

The database must not rely on client-provided creation timestamps for authoritative records.

---

# 45. IDs

Primary identifiers should use UUIDs or another sufficiently collision-resistant identifier.

Identifiers must not expose sequential internal database counts unnecessarily.

Public resource IDs should not reveal sensitive information.

---

# 46. Indexing

Production indexes must support the application's most common authorization and retrieval patterns.

Important indexing candidates include:

```text
account_id
project_id
conversation_id
file_id
created_at
status
provider_subscription_id
provider_customer_id
product_type
```

Composite indexes should be created where actual query patterns require them.

Indexes must be validated against production query behavior rather than added indiscriminately.

---

# 47. Transactions

Operations that modify multiple related records must use database transactions where atomicity is required.

Examples:

```text
Create account
+
Create trial
```

and:

```text
Process billing state
+
Update subscription
+
Update related entitlement state
```

and:

```text
Create product record
+
Create required supporting records
```

Partial state must not be silently accepted when the operation requires atomicity.

---

# 48. Concurrency

Production operations must account for concurrent requests.

Examples:

- Duplicate trial creation
- Duplicate billing webhooks
- Concurrent usage updates
- Simultaneous file processing
- Concurrent version creation

The application must use:

- Unique constraints
- Transactions
- Idempotency
- Appropriate locking
- Atomic updates

where necessary.

---

# 49. Prisma

Prisma is the application database access layer.

The Prisma schema must represent the authoritative PostgreSQL schema.

Migrations must be version-controlled.

The project must not maintain competing hand-written migration systems as separate sources of truth.

---

# 50. Migration Rules

Database migrations must be:

- Version-controlled
- Reviewable
- Reproducible
- Tested
- Forward-safe
- Applied consistently across environments

Production migrations must be reviewed before deployment.

Destructive migrations require explicit planning.

---

# 51. Environment Separation

Development, staging, and production use separate databases.

```text
Development → Development PostgreSQL
Staging     → Staging PostgreSQL
Production  → Production PostgreSQL
```

No environment may accidentally point at another environment's database.

---

# 52. Backup and Recovery

Production database backups must be enabled.

Recovery procedures must be documented.

Backup verification must include restoration testing.

A successful backup job alone is not sufficient evidence that recovery works.

---

# 53. Privacy

Aila data may contain:

- Personal information
- Business information
- Legal documents
- Source code
- Private conversations
- Uploaded files

Therefore:

- Data access must be authorized.
- Sensitive content must not be unnecessarily logged.
- Analytics must minimize sensitive information.
- Error monitoring must filter sensitive fields.
- Administrative access must be controlled and auditable.

---

# 54. Data Retention

Retention policies must be defined for:

- User data
- Deleted data
- Billing records
- Audit logs
- Usage records
- Files
- Vector data
- Application logs

Retention must account for applicable legal, operational, and contractual requirements.

---

# 55. Data Architecture Invariants

The following rules are mandatory.

1. PostgreSQL is the authoritative transactional database.
2. Neon object storage stores binary file content.
3. Qdrant stores vector/search data.
4. Redis stores temporary/cache data.
5. Authentication credentials are managed by Neon Auth.
6. Every private resource has an ownership or authorization relationship.
7. Trial state is server-authoritative.
8. Subscription state is server-authoritative.
9. Entitlements are centralized.
10. Product data remains product-specific.
11. Sensitive content is not unnecessarily duplicated.
12. Cross-system deletion is explicitly handled.
13. Database migrations are version-controlled.
14. Production databases are separated from non-production databases.
15. No feature bypasses authorization.
16. No client-controlled value can grant access to Aila Pro.
17. No vector search can bypass account/project isolation.
18. No temporary infrastructure becomes the source of truth.

---

# 56. Final Production Data Model

The conceptual production structure is:

```text
ACCOUNT
│
├── Trial
│
├── Subscription
│
├── Entitlements
│
├── Usage
│
├── Settings
│
├── Notifications
│
├── Audit Logs
│
└── Projects
      │
      ├── Members
      ├── Folders
      ├── Files
      │     └── Storage / Vectors
      │
      ├── Conversations
      │     └── Messages
      │
      ├── Intelligence Data
      │
      ├── Writer
      │     ├── Books
      │     ├── Chapters
      │     └── Versions
      │
      ├── Translate
      │     ├── Translations
      │     └── History
      │
      ├── Ads
      │     ├── Campaigns
      │     └── Reports
      │
      ├── Legal
      │     ├── Documents
      │     └── Analyses
      │
      └── Coding
            ├── Projects
            └── Sessions
```

This data architecture is the foundation for Aila v1.0 and must be implemented consistently across development, staging, and production.