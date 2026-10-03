# Aila V1 Application Architecture Specification

**Product:** Aila  
**Release:** V1.0  
**Status:** Production Specification  
**Brand:** Aila — think, create, and build.

---

# 1. Purpose

This document defines the production application structure for Aila V1.

It establishes:

- Application boundaries
- Source-code ownership
- Dependency direction
- Shared service boundaries
- Product boundaries
- API boundaries
- Database boundaries
- UI boundaries
- Testing boundaries
- Configuration boundaries
- Deployment boundaries

The purpose is to prevent architectural drift as Aila grows.

---

# 2. Canonical Repository

The permanent Aila repository is:

```text
/home/aila/Projects/Aila
```

This repository is the authoritative source tree for Aila.

No alternate permanent Aila repository may be created.

No temporary replacement application may be created.

No duplicate production application workspace may be introduced.

---

# 3. Application Stack

Aila V1 uses:

- Next.js
- React
- TypeScript
- Node.js 24+
- pnpm
- Prisma
- PostgreSQL
- Supabase Auth
- Supabase Storage
- tRPC
- Qdrant
- Upstash
- Resend
- PostHog
- Sentry
- Cloudflare
- Flutterwave
- Central Aila AI Gateway

The implementation must use the versions and compatibility constraints established by the repository's package manifests and deployment configuration.

---

# 4. Application Structure

The production application follows:

```text
Aila/
├── app/
│   ├── (marketing)/
│   ├── (auth)/
│   ├── dashboard/
│   ├── intelligence/
│   ├── writer/
│   ├── translate/
│   ├── ads/
│   ├── legal/
│   ├── coding/
│   └── api/
│
├── src/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── navigation/
│   │   ├── forms/
│   │   ├── dialogs/
│   │   ├── uploads/
│   │   └── billing/
│   │
│   ├── features/
│   │   ├── intelligence/
│   │   ├── writer/
│   │   ├── translate/
│   │   ├── ads/
│   │   ├── legal/
│   │   └── coding/
│   │
│   ├── services/
│   │   ├── ai/
│   │   ├── auth/
│   │   ├── billing/
│   │   ├── storage/
│   │   ├── email/
│   │   ├── analytics/
│   │   └── monitoring/
│   │
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   ├── utils/
│   └── middleware/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── public/
│   ├── icons/
│   ├── images/
│   └── videos/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── security/
│
├── docs/
├── infrastructure/
└── .github/
    └── workflows/
```

---

# 5. Dependency Direction

Dependencies must flow toward stable domain and infrastructure boundaries.

Preferred direction:

```text
UI
 ↓
Feature
 ↓
Application Service
 ↓
Domain / Shared Service
 ↓
Infrastructure Adapter
 ↓
External System
```

Example:

```text
Coding UI
 ↓
Coding Feature
 ↓
Coding Service
 ↓
AI Gateway
 ↓
Provider Adapter
 ↓
OpenRouter
```

A React component must not directly call OpenRouter.

A product feature must not directly access Flutterwave.

A browser component must not directly access PostgreSQL.

---

# 6. UI Layer

The `app/` directory owns route-level composition.

The `src/components/` directory owns reusable UI.

The UI layer is responsible for:

- Rendering
- Navigation
- User interaction
- Form presentation
- Loading states
- Error states
- Accessibility
- Responsive behavior

The UI layer is not authoritative for:

- Authentication
- Authorization
- Trial state
- Subscription state
- Entitlements
- Usage limits
- Data ownership

---

# 7. Server Components

Server Components should be used where appropriate for:

- Initial authenticated page loading
- Server-authorized data loading
- SEO-sensitive marketing pages
- Secure server-side composition

Client Components should be used only where client-side interaction is required.

Sensitive server-side operations must not be moved into client code merely for convenience.

---

# 8. Feature Architecture

Each product feature owns its product-specific behavior.

Example:

```text
src/features/writer/
├── components/
├── server/
├── schemas/
├── types/
├── utils/
└── index.ts
```

Equivalent structures may exist for:

- Intelligence
- Translate
- Ads
- Legal
- Coding

The exact internal structure may evolve, but product logic must remain identifiable and isolated.

---

# 9. Shared Components

Shared components belong in:

```text
src/components/
```

Examples:

- Buttons
- Inputs
- Dialogs
- Navigation
- Layout
- Upload controls
- Billing controls
- Notifications

A shared component must remain product-agnostic unless it is explicitly designed for a shared product pattern.

---

# 10. UI Design System

Aila must use one shared UI foundation.

Components should provide:

- Consistent interaction behavior
- Consistent spacing
- Consistent typography
- Consistent states
- Accessible semantics
- Responsive behavior

Product features should compose the shared UI rather than creating visually inconsistent duplicates.

---

# 11. API Architecture

tRPC is the primary application API.

Application requests follow:

```text
Client
 ↓
tRPC
 ↓
Authentication Context
 ↓
Authorization
 ↓
Validation
 ↓
Application Service
 ↓
Domain / Infrastructure
```

tRPC procedures must not become arbitrary business-logic containers.

Complex logic belongs in services.

---

# 12. Route Handlers

Next.js Route Handlers are reserved for direct HTTP semantics.

Approved uses include:

- Billing webhooks
- Authentication callbacks
- Health endpoints
- External callbacks
- Other explicitly HTTP-oriented integrations

Product CRUD should not be split arbitrarily between tRPC and Route Handlers.

---

# 13. API Context

Every authenticated tRPC request should have access to a trusted request context containing the appropriate:

- User identity
- Account identity
- Session information
- Request ID
- Authorization context

The context must not contain client-provided claims treated as trusted identity.

---

# 14. Validation

Use explicit schemas for externally supplied data.

Validation must occur before domain operations.

Validate:

- Required fields
- Types
- String lengths
- Enumerations
- IDs
- File metadata
- Pagination
- Sorting
- Filters
- User-provided configuration

Validation errors must be safe and structured.

---

# 15. Services

Shared application services belong in:

```text
src/services/
```

Required service boundaries include:

```text
src/services/
├── ai/
├── auth/
├── billing/
├── storage/
├── email/
├── analytics/
└── monitoring/
```

Additional services may be introduced when justified by architectural boundaries.

---

# 16. AI Service Boundary

The AI service is the only application boundary allowed to communicate with external AI providers.

Product features call:

```text
AI Service
 ↓
AI Gateway
```

The AI service is responsible for application integration.

The AI Gateway is responsible for:

- Authentication
- Authorization
- Entitlements
- Rate limits
- Model routing
- Provider selection
- Context policy
- Streaming
- Retries
- Timeouts
- Usage
- Cost metadata
- Observability
- Provider error normalization

---

# 17. Billing Service Boundary

All payment-provider interactions belong behind:

```text
src/services/billing/
```

Products must never directly import Flutterwave SDKs or provider-specific billing code.

Billing Service responsibilities:

- Customer creation
- Checkout initialization
- Subscription lookup
- Webhook processing
- Subscription state synchronization
- Provider error handling
- Idempotency

---

# 18. Storage Service Boundary

All file operations must use the storage service.

Responsibilities:

- Upload authorization
- Download authorization
- Object paths
- Metadata
- Deletion
- Storage-provider interaction
- File processing coordination

Products must not directly implement Supabase Storage authorization.

---

# 19. Email Service Boundary

Email providers are accessed only through the shared email service.

Products request semantic operations.

Example:

```text
emailService.sendTrialEnding(...)
```

rather than embedding provider-specific calls in product features.

---

# 20. Analytics Boundary

Analytics events must use a shared analytics interface.

Product features may emit events such as:

```text
project_created
ai_request_started
ai_request_completed
export_completed
subscription_started
```

Events must not contain sensitive content by default.

Avoid:

- Prompt contents
- Source code
- Legal documents
- Credentials
- Full translations
- Private business data

---

# 21. Monitoring Boundary

Application monitoring must use a shared monitoring interface.

Errors should include:

- Request ID
- User/account identifiers where safe
- Product
- Operation
- Error category
- Environment

Sensitive user content must be excluded or redacted.

---

# 22. Authentication Boundary

Authentication operations belong behind the shared authentication service.

Product features must not implement independent login systems.

Authentication should resolve:

```text
Identity
 ↓
Aila User
 ↓
Aila Account
```

---

# 23. Authorization Boundary

Authorization should be represented through reusable server-side policies.

Examples:

```text
canAccessAccount()
canAccessProject()
canEditProject()
canReadFile()
canUseProduct()
canUseCapability()
```

Authorization must be applied before protected resource access.

---

# 24. Entitlement Boundary

Entitlement checks belong to the centralized entitlement system.

Product code asks whether a capability is available.

It must not independently interpret:

- Trial timestamps
- Subscription status
- Provider state
- Billing events

---

# 25. Trial Boundary

Trial logic belongs to the shared trial service.

The service determines:

- Whether the account has a trial
- Whether it is active
- When it expires
- Whether it has ended
- Whether access remains available

The frontend may display server-provided state but cannot determine authoritative eligibility.

---

# 26. Database Boundary

Prisma is the database access layer.

PostgreSQL is the authoritative transactional database.

Database access should occur through server-side modules.

The browser must never connect directly to PostgreSQL.

---

# 27. Prisma Structure

The production schema lives at:

```text
prisma/schema.prisma
```

Migrations live at:

```text
prisma/migrations/
```

Prisma migrations are authoritative.

Do not maintain a competing hand-written migration system.

---

# 28. Database Access

Application code should use a controlled Prisma client.

The Prisma client must be configured for:

- Production connection management
- Environment-specific credentials
- Safe connection lifecycle
- Appropriate logging
- Error normalization

Database credentials must never reach the browser.

---

# 29. Transaction Boundaries

Use transactions when operations require atomicity.

Examples:

- Account creation
- Trial creation
- Subscription updates
- Project deletion
- File metadata + state changes
- Version creation
- Entitlement changes

Transactions should remain focused.

Long-running AI operations must not hold open database transactions unnecessarily.

---

# 30. Domain Ownership

Shared domain models should remain centralized.

Product-specific models belong in their product domain.

Example:

```text
Account
Subscription
Trial
Project
File
```

are shared.

Whereas:

```text
WriterDocument
Translation
AdCampaign
LegalAnalysis
CodingFile
```

are product-specific.

---

# 31. Product Isolation

Product modules must not directly manipulate another product's private implementation.

Cross-product functionality should use shared services or explicit domain contracts.

Example:

```text
Writer
 ↓
Shared File Service
```

not:

```text
Writer
 ↓
Coding internal database implementation
```

---

# 32. Shared Types

Shared types belong in appropriate central locations.

Types must not become a dumping ground for arbitrary product logic.

Shared types should represent:

- IDs
- Common status values
- API contracts
- Shared metadata
- Common pagination
- Shared errors

Product-specific types remain within product boundaries.

---

# 33. Configuration

Configuration must be centralized and validated.

Configuration should distinguish:

- Required secrets
- Public configuration
- Environment-specific settings
- Feature configuration
- Product limits
- AI model policy
- Upload limits
- Rate limits

Application startup should fail clearly when mandatory production configuration is missing.

---

# 34. Environment Variables

Production secrets must never be committed.

Required environment configuration is documented through:

```text
.env.example
```

Real values must exist only in the appropriate environment's secret/configuration system.

---

# 35. Logging

Use structured logging.

Each important request should have a correlation/request ID.

Logs should capture operational facts such as:

- Operation
- Duration
- Result
- Error category
- Account/user reference where appropriate

Logs must not indiscriminately contain:

- Prompts
- Full AI responses
- Source code
- Legal documents
- Credentials
- Access tokens
- Private uploaded files

---

# 36. Error Handling

Errors must be normalized before reaching users.

The application must distinguish:

- Expected user errors
- Authorization failures
- Validation errors
- Conflicts
- Dependency failures
- Internal failures

Internal stack traces remain server-side.

---

# 37. Background Jobs

Background work must not block interactive requests unnecessarily.

Examples:

- File processing
- Document conversion
- Embeddings
- Large exports
- Large AI operations
- Notifications
- Email
- Cleanup

Workers must authenticate/authorize the job context before accessing protected data.

---

# 38. Caching

Caching belongs behind explicit infrastructure boundaries.

A cache may store derived or temporary state.

It must never become the authority for:

- Ownership
- Authentication
- Subscription
- Trial expiration
- Entitlements

Cache keys must include appropriate account/project scope.

---

# 39. Security Middleware

Shared middleware may provide:

- Security headers
- Authentication context
- Request IDs
- Rate limiting hooks
- Request normalization

Middleware must not replace resource-level authorization.

---

# 40. Security Headers

Production responses should use appropriate security headers, including a controlled:

- Content Security Policy
- Referrer Policy
- Permissions Policy
- Frame protection
- MIME sniffing protection

Policies must be compatible with required application functionality and tightened before production release.

---

# 41. Client Security

The browser must not receive:

- Database credentials
- AI provider keys
- Billing provider secrets
- Storage service secrets
- Internal service credentials

Only explicitly public configuration may be exposed.

---

# 42. PWA Boundary

PWA implementation belongs to the shared application shell.

It must provide:

- Manifest
- Icons
- Install metadata
- Responsive behavior
- Service-worker/update strategy where used
- Secure caching

Caching must never allow stale authorization or billing state to grant access.

---

# 43. Routing

Application routing follows product boundaries:

```text
/
 /dashboard
 /intelligence
 /writer
 /translate
 /ads
 /legal
 /coding
```

Protected routes must require authenticated application state.

Product routes must additionally enforce product entitlements where required.

---

# 44. Loading and Error States

Every production page and significant asynchronous operation must define:

- Loading state
- Empty state
- Error state
- Retry behavior where appropriate
- Success state

No page should rely on an unhandled promise rejection or blank UI when a dependency fails.

---

# 45. Forms

Forms must use:

- Shared validation
- Accessible labels
- Server-side validation
- Safe error messages
- Submission state
- Duplicate-submit protection where needed

Client validation improves UX but does not replace server validation.

---

# 46. File UI

File interfaces must use the shared file service.

UI should communicate:

- Upload state
- Processing state
- Ready state
- Failed state
- Delete state

Users must never be shown a completed file-processing state before the backend has confirmed completion.

---

# 47. AI UI

All product AI interfaces should support:

- Request state
- Streaming state where applicable
- Cancellation
- Failure
- Retry
- Usage/limit feedback
- Clear distinction between generated and persisted content

AI-generated changes must not silently overwrite user-owned content.

---

# 48. Testing Structure

Tests follow:

```text
tests/
├── unit/
├── integration/
├── e2e/
└── security/
```

Product-specific tests may also live near product modules where appropriate, but critical platform behavior must remain covered centrally.

---

# 49. Unit Testing

Unit tests should cover:

- Domain logic
- Authorization policies
- Entitlement resolution
- Trial calculations
- Validation
- Transformations
- Error mapping
- Utility functions

Unit tests must not depend unnecessarily on production services.

---

# 50. Integration Testing

Integration tests should verify:

- Database behavior
- Authentication integration
- Authorization
- Storage
- AI Gateway
- Billing
- Notifications
- Background jobs
- Search
- Retrieval isolation

---

# 51. End-to-End Testing

Critical user journeys must be tested through the actual application.

Minimum flows:

```text
Create account
Activate trial
Open product
Create project
Create content
Use AI
Persist result
Expire trial
Subscribe
Continue using product
Delete account
```

Each six-product workflow must have product-specific critical-path coverage.

---

# 52. Security Testing

Security tests must verify:

- Cross-account isolation
- Cross-project isolation
- Authentication enforcement
- Authorization enforcement
- Trial bypass resistance
- Entitlement bypass resistance
- File access control
- Storage access control
- Prompt injection handling
- Secret protection
- Path traversal protection
- Webhook verification
- Rate-limit behavior

---

# 53. Dependency Rules

Dependencies should be added only when they provide clear production value.

Before adding a dependency, evaluate:

- Maintenance status
- Security posture
- License
- Bundle impact
- Compatibility
- Runtime behavior
- Long-term architectural impact

Avoid unnecessary libraries that duplicate existing platform capabilities.

---

# 54. Package Boundaries

The repository packages should eventually follow:

```text
packages/
├── ai/
├── auth/
├── config/
├── db/
├── ui/
└── validation/
```

Their responsibilities:

### `@aila/ai`

AI Gateway interfaces and shared AI contracts.

### `@aila/auth`

Authentication and authorization contracts.

### `@aila/config`

Validated application configuration.

### `@aila/db`

Prisma/database access contracts.

### `@aila/ui`

Shared UI components.

### `@aila/validation`

Shared schemas and validation contracts.

Packages must not create circular dependencies.

---

# 55. Package Dependency Direction

Preferred:

```text
config
 ↑
validation
 ↑
db / auth
 ↑
services
 ↑
features
 ↑
UI
```

Infrastructure packages should not import application UI.

UI packages should not import database clients.

---

# 56. Import Rules

Avoid deep imports into another module's internal implementation.

Prefer public module boundaries:

```text
@aila/validation
@aila/auth
@aila/db
@aila/ai
@aila/ui
```

Product modules should expose only intentional public interfaces.

---

# 57. Code Quality

Production code must maintain:

- Strict TypeScript
- No unsafe `any` where avoidable
- Explicit error handling
- No dead production code
- No debug credentials
- No placeholder security controls
- No fake providers
- No mock billing implementation in production paths
- No hardcoded secrets
- No silent error swallowing

---

# 58. Temporary Code Rule

Aila V1 is production-first.

The following are not acceptable as production implementations:

- Temporary authentication
- Fake subscriptions
- Fake billing
- Mock AI providers
- Placeholder authorization
- Hardcoded trial bypasses
- In-memory production databases
- Local-only file storage
- Unisolated arbitrary code execution
- Temporary security controls
- Prototype APIs that are intended to be replaced

Development tooling may use mocks for isolated automated tests, but production runtime paths must use the real architectural interfaces.

---

# 59. Feature Completion

A feature is complete only when:

1. UI exists where required.
2. Server logic exists.
3. Database persistence exists where required.
4. Authorization exists.
5. Validation exists.
6. Error handling exists.
7. Loading/empty states exist.
8. Usage/entitlement rules exist where applicable.
9. Security controls exist.
10. Tests exist.
11. Observability exists.
12. Documentation exists.
13. Deployment behavior is defined.

---

# 60. Production Release Gate

Aila V1 cannot be released until:

- TypeScript passes.
- Lint passes.
- Unit tests pass.
- Integration tests pass.
- End-to-end tests pass.
- Security tests pass.
- Production build succeeds.
- Database migrations are validated.
- Environment configuration is validated.
- Authentication is verified.
- Authorization is verified.
- Trial is verified.
- Billing is verified.
- Entitlements are verified.
- AI Gateway is verified.
- Storage is verified.
- Monitoring is verified.
- Backup/recovery is verified.
- Critical workflows are verified.

---

# 61. Architectural Invariants

The following are permanent rules:

1. `/home/aila/Projects/Aila` remains the canonical repository.
2. Aila has one application architecture.
3. Aila has one account model.
4. Aila has one authentication boundary.
5. Aila has one entitlement system.
6. Aila has one usage system.
7. Aila has one AI Gateway.
8. Aila has one Billing Service boundary.
9. PostgreSQL is the authoritative transactional database.
10. Prisma migrations are authoritative.
11. tRPC is the primary application API.
12. Route Handlers are reserved for direct HTTP semantics.
13. Products cannot bypass shared security boundaries.
14. Provider credentials remain server-side.
15. Private user data is never public by default.
16. Product-specific code remains isolated.
17. Derived systems never replace authoritative data.
18. Arbitrary user code never executes on the main application server.
19. Production and non-production environments remain isolated.
20. Production readiness is determined by tested behavior, not by UI appearance.

---

# 62. Final Architecture Principle

Aila V1 must be implemented as a cohesive production application with strong shared foundations and clear product boundaries.

The architecture should make the secure path the easiest path.

Every new feature must fit the established boundaries rather than creating a parallel implementation.

The objective is not merely to make Aila function.

The objective is to make Aila **operable, secure, testable, maintainable, observable, and releasable as a production SaaS product.**