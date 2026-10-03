# Aila v1.0 Production Architecture

**Product:** Aila  
**Version:** v1.0  
**Positioning:** Think, create, and build.  
**Architecture Status:** Production specification  
**Repository:** `/home/aila/Projects/Aila`

---

## 1. Purpose

Aila is a production SaaS application providing six specialized AI products under one account and one subscription.

The six products are:

1. Aila Intelligence
2. Aila Writer
3. Aila Translate
4. Aila Ads
5. Aila Legal
6. Aila Coding

Aila is not six generic chat interfaces.

Each product has its own:

- Workspace
- Domain model
- Tools
- Files
- History
- Workflows
- Product-specific AI behavior

The products share common platform infrastructure for:

- Authentication
- Accounts
- Billing
- Entitlements
- AI access
- File storage
- Search
- Usage tracking
- Notifications
- Security
- Monitoring

---

# 2. Production Principles

Aila v1.0 follows these principles.

### 2.1 Production-first

Anything implemented in the repository is intended to become part of the production system.

There are no throwaway application architectures.

### 2.2 Single source of truth

Each domain must have one authoritative source of state.

Database schemas, billing state, entitlements, authentication state, and application configuration must not have competing sources of truth.

### 2.3 Server-authoritative security

The client must never be trusted to determine:

- Authentication state
- Trial state
- Subscription state
- Entitlements
- Usage limits
- Authorization
- Ownership
- Billing status

All security-sensitive decisions are enforced server-side.

### 2.4 Product separation

The six products share infrastructure but maintain separate domain logic.

### 2.5 Centralized AI access

Products never communicate directly with AI providers.

All AI requests pass through the Aila AI Gateway.

### 2.6 Privacy by design

User conversations, files, legal documents, code, and business information are treated as potentially sensitive data.

Logging must be deliberate and minimized.

### 2.7 Explicit production boundaries

Features are not considered complete because a UI exists.

A production feature requires:

- Backend implementation
- Authorization
- Validation
- Persistence where required
- Error handling
- Observability
- Security controls
- Tests
- Production acceptance criteria

---

# 3. High-Level Architecture

```text
                         ┌──────────────────────┐
                         │       AILA USER      │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │       Cloudflare     │
                         │ CDN / DNS / Security  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │        Vercel        │
                         │       Next.js        │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
          ┌──────────────────┐          ┌──────────────────┐
          │  Next.js Pages   │          │ HTTP Route        │
          │  / App Router    │          │ Handlers          │
          └────────┬─────────┘          └────────┬─────────┘
                   │                             │
                   ▼                             ▼
          ┌──────────────────┐          ┌──────────────────┐
          │   tRPC API       │          │ External Callbacks│
          │ Application API  │          │ Webhooks / Health │
          └────────┬─────────┘          └────────┬─────────┘
                   │                             │
                   └──────────────┬──────────────┘
                                  ▼
                       ┌──────────────────────┐
                       │   Aila Services      │
                       ├──────────────────────┤
                       │ Auth                 │
                       │ Accounts             │
                       │ Entitlements         │
                       │ Billing              │
                       │ AI Gateway            │
                       │ Files                │
                       │ Search               │
                       │ Usage               │
                       │ Notifications        │
                       │ Product Services     │
                       └──────────┬───────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
             ▼                    ▼                    ▼
      ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
      │ PostgreSQL   │    │   Storage    │    │   Qdrant     │
      │   Supabase   │    │   Supabase   │    │ Vector Search│
      └──────────────┘    └──────────────┘    └──────────────┘
                                  │
                                  ▼
                         ┌──────────────────────┐
                         │    Aila AI Gateway   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                              ┌─────────────┐
                              │ OpenRouter  │
                              └─────────────┘
```

---

# 4. Frontend Architecture

## 4.1 Framework

Aila uses:

- Next.js
- React
- TypeScript
- TailwindCSS
- shadcn/ui
- Framer Motion

The frontend is implemented using the Next.js App Router.

## 4.2 Application areas

The application contains:

```text
/
├── Marketing
├── Authentication
├── Dashboard
├── Intelligence
├── Writer
├── Translate
├── Ads
├── Legal
└── Coding
```

Each product has its own workspace and navigation.

## 4.3 PWA

Aila v1.0 is browser-first and installable as a Progressive Web App where supported.

The production application must provide:

- Web app manifest
- Application icons
- Responsive layouts
- Mobile-friendly navigation
- HTTPS
- Install metadata
- Appropriate caching strategy
- Controlled application updates

PWA support must not compromise authentication, security, billing, or data freshness.

---

# 5. Backend Architecture

Aila uses TypeScript throughout the application backend.

## 5.1 API architecture

tRPC is the primary typed application API.

Next.js Route Handlers are reserved for HTTP-specific endpoints such as:

- Billing webhooks
- Authentication callbacks where required
- Health endpoints
- External service callbacks
- Other endpoints that require direct HTTP semantics

Aila must not maintain two competing application API architectures.

## 5.2 Service boundaries

Backend services include:

```text
services/
├── auth
├── accounts
├── entitlements
├── billing
├── ai
├── storage
├── search
├── usage
├── notifications
├── analytics
└── monitoring
```

Product-specific business logic remains inside the corresponding product domain.

---

# 6. Product Architecture

The six products are separate domains.

```text
features/
├── intelligence/
├── writer/
├── translate/
├── ads/
├── legal/
└── coding/
```

A product may consume shared services but must not directly modify another product's internal domain state.

---

# 7. Aila Intelligence

## Purpose

General-purpose AI workspace for thinking, creation, communication, planning, research, and productivity.

## Core capabilities

- Conversations
- Project planning
- Research assistance
- File analysis
- Voice notes
- Transcription
- Image generation
- Image editing
- Image analysis
- Video analysis
- Short video generation
- Search
- Project context
- Conversation history
- Export

## Workspace

```text
Project
├── Conversations
├── Files
├── Images
├── Videos
├── Voice Notes
└── Exports
```

---

# 8. Aila Writer

## Purpose

Professional long-form writing workspace.

## Core capabilities

- Books
- Novels
- Articles
- Blogs
- Reports
- Documentation
- Research notes
- Character profiles
- Story planning
- Outlines
- Chapters
- Rewriting
- Grammar improvement
- Tone adjustment
- Version history
- Export

## Publishing

Where supported by the v1.0 implementation:

- EPUB
- PDF
- DOCX
- Book structure
- Publishing guidance

## Workspace

```text
Book
├── Outline
├── Chapters
├── Characters
├── Notes
├── Versions
└── Export
```

---

# 9. Aila Translate

## Purpose

Context-aware professional translation workspace.

## Core capabilities

- Text translation
- Document translation
- Language detection
- Formal tone
- Casual tone
- Context preservation
- Translation history
- Side-by-side review
- Export

## Workflow

```text
Original
   ↓
Translate
   ↓
Review
   ↓
Export
```

---

# 10. Aila Ads

## Purpose

Marketing and advertising planning workspace.

## Core capabilities

- Campaign planning
- Objectives
- Audience creation
- Customer personas
- Marketing strategy
- Headlines
- Primary text
- Descriptions
- CTAs
- Variations
- Creative briefs
- Campaign analysis
- Reports

## Platforms

Initial supported planning contexts:

- Facebook
- Instagram
- Threads
- Messenger
- Google
- YouTube
- LinkedIn
- TikTok
- X

Platform integrations are separate future capabilities and require compliance with each platform's policies and APIs.

## Workspace

```text
Campaign
├── Objective
├── Audience
├── Budget
├── Creatives
├── Ads
├── Variations
└── Reports
```

---

# 11. Aila Legal

## Purpose

Legal-information and document-analysis workspace.

## Core capabilities

- Contract analysis
- Agreement analysis
- Clause identification
- Definitions
- Summaries
- Issue spotting
- Risk identification
- Compliance review
- Questions and answers
- Document comparison
- Reports

## Workspace

```text
Legal Matter
├── Documents
├── Findings
├── Risks
├── Analysis
└── Reports
```

## Legal safeguards

Aila Legal must:

- Clearly identify uncertainty
- Preserve source attribution where available
- Distinguish document text from AI interpretation
- Handle jurisdiction/context explicitly
- Protect uploaded documents
- Maintain appropriate audit records
- Provide clear legal-information disclaimers

Aila Legal assists with legal information and document analysis and does not replace professional legal advice.

---

# 12. Aila Coding

## Purpose

Software development workspace.

## Core capabilities

- Code review
- Debugging
- Refactoring
- Architecture planning
- Test generation
- Error analysis
- Documentation
- Website generation
- Landing page generation
- Small application generation
- API planning

## Supported technologies

Initial contexts include:

- HTML
- CSS
- JavaScript
- TypeScript
- React
- Next.js
- Node.js
- Python
- PHP
- SQL

## Workspace

```text
Project
├── Files
├── Tasks
├── Tests
├── Sessions
└── Documentation
```

User-provided code must not be executed directly inside the primary Aila application server.

Any future arbitrary code execution must use an isolated execution environment.

---

# 13. Authentication

Authentication is provided by Supabase Auth.

Supported authentication methods include:

- Email/password
- Google authentication
- Password reset
- Session management

Authentication state is server-validated.

User identity must never be trusted solely from client-provided identifiers.

---

# 14. Account Model

Each user has one Aila account.

The account owns or has authorized access to:

- Projects
- Files
- Conversations
- Product workspaces
- Subscription
- Usage
- Settings
- Notifications

All user-owned records require authorization checks.

---

# 15. Three-Hour Free Trial

Aila v1.0 does not use a permanent free plan.

Every eligible new account receives a **three-hour free trial** before subscription is required.

## Lifecycle

```text
Account Created
      ↓
Trial Started
      ↓
3 Hours
      ↓
Trial Expired
      ↓
Aila Pro Required
```

## Trial requirements

Trial state is stored server-side.

The trial model must contain sufficient state to determine:

- Start time
- Expiration time
- Status
- End time where applicable

The frontend must never calculate entitlement independently.

## Trial expiration

When the trial expires:

- Existing user data remains preserved.
- Existing projects remain accessible according to the defined access policy.
- New Pro functionality requires an active subscription.
- Subscription status is checked server-side.

---

# 16. Aila Pro

Aila Pro is the single subscription providing access to the complete Aila product offering.

Pro includes:

- Intelligence
- Writer
- Translate
- Ads
- Legal
- Coding
- Advanced models
- Higher usage limits
- More uploads
- More projects
- Priority access where supported

Entitlements are centralized.

Example:

```text
Entitlements
├── intelligence
├── writer
├── translate
├── ads
├── legal
├── coding
├── file_upload
├── projects
└── advanced_models
```

Products query the entitlement service instead of implementing independent subscription checks.

---

# 17. Billing

Flutterwave is the initial payment provider.

Billing architecture:

```text
Aila Billing Service
        ↓
Flutterwave
        ↓
Webhook
        ↓
Aila Billing Webhook Handler
        ↓
Subscription State
        ↓
Entitlement Service
```

Billing state must be stored in PostgreSQL.

Webhook processing must be:

- Authenticated
- Idempotent
- Auditable
- Retry-safe

Provider-specific implementation details must remain isolated behind the billing service.

---

# 18. AI Gateway

Every AI request passes through the Aila AI Gateway.

```text
Product
   ↓
Aila AI Interface
   ↓
AI Gateway
   ↓
Authentication
   ↓
Entitlement Check
   ↓
Rate / Usage Check
   ↓
Model Policy
   ↓
Provider Routing
   ↓
AI Provider
   ↓
Response
   ↓
Usage Recording
```

Products must never contain provider API keys.

## Gateway responsibilities

- Provider routing
- Model selection
- Authentication
- Entitlement checks
- Rate limiting
- Usage checks
- Request validation
- Timeouts
- Retry policy
- Streaming
- Usage recording
- Cost tracking
- Error normalization
- Provider abstraction

---

# 19. AI Providers

Initial provider:

**OpenRouter**

OpenRouter provides access to multiple supported models through a centralized API.

Potential model families include:

- DeepSeek
- Gemini
- Llama
- Mistral
- Other supported models

Future providers may include:

- OpenAI
- Anthropic
- Direct Gemini API

Provider implementations must remain replaceable.

A product must never depend directly on a provider-specific SDK or API contract.

---

# 20. AI Usage

Aila records AI usage for operational and billing-control purposes.

Usage records should capture appropriate metadata such as:

- User
- Product
- Model
- Provider
- Request type
- Token usage where available
- Estimated cost where available
- Request duration
- Timestamp
- Success/failure

Sensitive prompt and response content must not automatically be copied into operational logs.

Conversation content belongs to the appropriate product data model.

---

# 21. Database

Primary database:

**PostgreSQL through Supabase**

The database is the authoritative source for transactional application state.

Primary domains include:

```text
users
accounts
subscriptions
usage_records
projects
project_members
files
folders
conversations
messages
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
audit_logs
notifications
settings
```

The final Prisma schema and migrations will define the authoritative database structure once database implementation begins.

---

# 22. Data Ownership

Every user-owned record must have a clear ownership or authorization relationship.

Queries must enforce authorization at the server/service layer.

A user must never be able to access another user's:

- Projects
- Files
- Conversations
- Documents
- Campaigns
- Legal materials
- Coding projects
- Usage records
- Settings

Where collaboration is introduced, access is represented explicitly through membership/permission records.

---

# 23. File Storage

Supabase Storage is the initial file storage platform.

Supported content may include:

- PDF
- DOCX
- TXT
- CSV
- Images
- Audio
- Video
- Generated reports

Files must have:

- Ownership
- Project relationship where applicable
- MIME type
- Size
- Storage key
- Created timestamp
- Appropriate metadata

Uploads must be validated before processing.

Validation includes:

- File type
- MIME type
- File size
- Extension
- Authorization
- Malware/security controls where required

Storage URLs must not expose private user files publicly.

---

# 24. Search and Vector Data

Qdrant is used for vector search where required.

Potential vector data includes:

- Document chunks
- Embeddings
- Project knowledge
- Search indexes
- AI memory

Vector records must have a secure relationship to their owning account/project.

Search queries must be scoped by authorization.

Vector data must never become an independent authority for transactional application state.

PostgreSQL remains authoritative for application records.

---

# 25. Cache and Rate Limiting

Upstash Redis is used where appropriate for:

- Rate limiting
- Short-lived cache
- Performance optimization
- Temporary coordination data

Redis must not become the authoritative source for durable business data.

If Redis becomes unavailable, the application must fail safely according to the operation being performed.

---

# 26. Email

Resend is the initial email provider.

Email use cases include:

- Verification
- Password recovery where applicable
- Account notifications
- Billing notifications
- Important service notifications

Email delivery must not expose sensitive application content unnecessarily.

---

# 27. Analytics

PostHog is used for product analytics.

Tracked events may include:

- Account creation
- Trial activation
- Product activation
- Product usage
- Trial expiration
- Subscription conversion
- Retention events

Analytics must avoid unnecessarily transmitting sensitive user content.

---

# 28. Error Monitoring

Sentry is used for application error monitoring.

Monitoring covers:

- Frontend errors
- Backend errors
- API failures
- Unexpected exceptions
- Important production failures

Sensitive information must be filtered from error reports where possible.

---

# 29. Security Architecture

## Authentication

Supabase Auth.

## Application security

Aila uses:

- Server-side authorization
- Input validation
- Secure cookies
- CSRF protections where applicable
- XSS protections
- Rate limiting
- API authorization
- Secure headers
- File validation
- Audit logging

## Network security

Cloudflare provides the external security and traffic layer where configured.

## Secrets

Secrets must never be committed to Git.

Production secrets must be stored using the deployment/platform secret-management mechanisms.

`.env.example` may document required variable names without containing secrets.

---

# 30. Audit Logging

Security-sensitive actions are recorded through an audit-log system where appropriate.

Examples include:

- Authentication events
- Permission changes
- Billing state changes
- Sensitive document actions
- Account security changes
- Administrative actions

Audit logs must not unnecessarily contain full sensitive document or conversation contents.

---

# 31. Environments

Aila uses three separated environments:

```text
Development
     ↓
Staging
     ↓
Production
```

Each environment has separate:

- Database
- Storage
- Secrets
- API credentials
- AI configuration
- Billing configuration

Production data must never be casually copied into development environments.

Production credentials must never be used in local development.

---

# 32. Deployment

Initial production deployment:

```text
User
 ↓
Cloudflare
 ↓
Vercel
 ↓
Next.js
```

Supporting infrastructure:

```text
Supabase
├── PostgreSQL
├── Authentication
└── Storage

Qdrant
└── Vector Search

Upstash
└── Redis

Resend
└── Email

OpenRouter
└── AI

Flutterwave
└── Billing

PostHog
└── Analytics

Sentry
└── Monitoring
```

---

# 33. Backups and Recovery

Production data requires a defined backup and recovery strategy.

Critical data includes:

- PostgreSQL data
- Storage metadata
- User files
- Subscription state
- Product data

Backups must be:

- Automated where supported
- Protected
- Tested for restoration
- Separated from primary production storage

A backup that has never been successfully restored is not considered a verified recovery mechanism.

---

# 34. Observability

Aila production observability uses:

### Cloudflare

- Traffic
- CDN
- Security events

### Vercel

- Deployment status
- Runtime information

### Supabase

- Database
- Authentication
- Storage

### Sentry

- Application errors

### PostHog

- Product analytics

### Internal usage telemetry

- AI usage
- Model usage
- Provider failures
- Usage limits
- Billing-related events

---

# 35. API and Service Rules

The following rules are mandatory:

1. Client input is never trusted.
2. Authorization is checked server-side.
3. Product code does not bypass entitlements.
4. AI providers are accessed only through the AI Gateway.
5. Billing providers are accessed only through the Billing Service.
6. Durable state belongs in PostgreSQL.
7. Redis is not the source of truth.
8. Vector databases are not the source of transactional truth.
9. Secrets are never committed.
10. Sensitive content is not unnecessarily logged.

---

# 36. Production Testing

Aila v1.0 requires multiple testing layers.

```text
tests/
├── unit/
├── integration/
├── e2e/
└── security/
```

Testing must cover:

- Authentication
- Authorization
- Trial lifecycle
- Entitlements
- Billing
- AI Gateway
- Usage limits
- File uploads
- Product workflows
- Data isolation
- Security controls
- Critical user journeys

A feature is not production-complete until its required tests pass.

---

# 37. Production Quality Gate

Aila v1.0 must not be considered production-ready merely because the application builds.

Before release, the following must be verified:

- Authentication works
- Account isolation works
- Three-hour trial works
- Trial expiration works
- Aila Pro subscription works
- Billing webhooks are idempotent
- Entitlements work
- AI Gateway works
- Usage tracking works
- File security works
- Product workflows work
- Data persistence works
- Error monitoring works
- Analytics works
- Security testing passes
- Backup/recovery is verified
- Production deployment succeeds
- Critical end-to-end tests pass

---

# 38. Production Non-Negotiable Rules

The following are permanent architectural rules for Aila v1.0.

### Rule 1

There is one canonical Aila repository.

### Rule 2

There is one Aila account system.

### Rule 3

There is one centralized entitlement system.

### Rule 4

There is one Aila AI Gateway.

### Rule 5

Products do not directly call AI providers.

### Rule 6

Products maintain separate domain logic.

### Rule 7

PostgreSQL is the authoritative transactional database.

### Rule 8

User data is isolated by authorization.

### Rule 9

The three-hour trial is server-controlled.

### Rule 10

Aila Pro is required after the trial expires.

### Rule 11

Production secrets never enter source control.

### Rule 12

No temporary production architecture is introduced.

### Rule 13

No feature is marked complete without production acceptance criteria.

### Rule 14

Security is implemented as part of each feature, not added after the application is finished.

### Rule 15

Future integrations must extend existing service boundaries rather than bypass them.

---

# 39. v1.0 Architectural Goal

The final Aila v1.0 system is:

```text
                         AILA
                Think, create, and build.
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   Intelligence         Writer           Translate
        │                  │                  │
        ├──────────────────┼──────────────────┤
        │                  │                  │
        ▼                  ▼                  ▼
       Ads                Legal             Coding
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                  Shared Aila Platform
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
       Auth             Billing          Entitlements
        │                  │                  │
        ├────────────── AI Gateway ───────────┤
        │                  │                  │
      Storage          PostgreSQL          Search
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                       Monitoring
```

Aila v1.0 is considered complete when the six products operate as distinct production workspaces on top of this shared platform, with one account, a three-hour trial, Aila Pro subscription access, centralized AI infrastructure, secure user data isolation, and production-grade operational controls.