# Aila v1.0 AI Gateway Architecture

**Product:** Aila  
**Version:** v1.0  
**Status:** Production specification  
**Primary AI Provider:** OpenRouter

---

# 1. Purpose

The Aila AI Gateway is the single controlled entry point for AI capabilities across all six Aila products.

The six products must never communicate directly with AI providers.

```text
Aila Product
     ↓
Aila AI Interface
     ↓
Aila AI Gateway
     ↓
Policy / Entitlement / Usage
     ↓
Model Selection
     ↓
Provider Adapter
     ↓
AI Provider
```

The gateway provides:

- Provider abstraction
- Model routing
- Authentication
- Entitlement enforcement
- Usage control
- Rate limiting
- Request validation
- Timeouts
- Retries
- Streaming
- Error normalization
- Usage recording
- Cost tracking
- Observability

---

# 2. Architectural Rule

Every AI request must pass through the Aila AI Gateway.

Prohibited:

```text
Aila Writer → OpenRouter
Aila Legal → OpenRouter
Aila Coding → OpenRouter
```

Required:

```text
Aila Writer
     ↓
Aila AI Gateway
     ↓
OpenRouter
```

The same rule applies to every product.

---

# 3. Provider Abstraction

The gateway must not expose provider-specific APIs to product code.

Product code requests an Aila AI operation.

Conceptually:

```text
Product
  ↓
AI Request
  ↓
Gateway
  ↓
Provider Adapter
```

Provider-specific implementation remains inside the AI infrastructure.

---

# 4. Initial Provider

The launch provider is:

**OpenRouter**

The gateway communicates with OpenRouter through a dedicated provider adapter.

OpenRouter credentials exist only in secure server-side configuration.

They must never be sent to the browser.

---

# 5. Future Providers

The architecture must support future provider adapters such as:

- OpenAI
- Anthropic
- Gemini Direct
- Other approved providers

Adding a provider must not require rewriting the six product domains.

Conceptually:

```text
                   Aila AI Gateway
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
      OpenRouter       OpenAI          Anthropic
```

---

# 6. Model Abstraction

Products request capabilities rather than hardcoding provider-specific model names wherever practical.

Example:

```text
capability:
  reasoning
```

rather than:

```text
provider:
  openrouter

model:
  provider-specific-model-name
```

The gateway resolves the appropriate model.

This allows model policies to change without rewriting product code.

---

# 7. Model Classes

The gateway may classify models by capability.

Example classes:

```text
fast
balanced
reasoning
coding
long_context
vision
image
audio
```

The exact launch model configuration is deployment configuration rather than product logic.

---

# 8. Model Policy

Model selection considers:

- Product
- Requested capability
- User entitlement
- Trial/subscription state
- Usage limits
- Provider availability
- Model availability
- Context requirements
- Input type
- Output requirements
- Cost policy
- Reliability

The gateway makes the final model-routing decision.

---

# 9. Request Lifecycle

Every request follows a controlled lifecycle.

```text
1. Receive request
        ↓
2. Authenticate account
        ↓
3. Authorize operation
        ↓
4. Resolve entitlement
        ↓
5. Check usage/rate limits
        ↓
6. Validate request
        ↓
7. Resolve model
        ↓
8. Build provider request
        ↓
9. Call provider
        ↓
10. Validate provider response
        ↓
11. Record usage
        ↓
12. Return normalized response
```

Failures must stop at the appropriate stage.

---

# 10. Authentication

The gateway accepts requests only from authenticated Aila application contexts unless an explicitly authorized internal operation is being performed.

Authentication must be verified server-side.

The gateway must never trust a client-supplied account ID.

The account identity is derived from the authenticated session/context.

---

# 11. Authorization

Authentication answers:

> Who is this?

Authorization answers:

> Is this account allowed to perform this operation?

The gateway must verify the relevant authorization before consuming provider resources.

---

# 12. Trial Authorization

During the three-hour trial, the entitlement service determines what AI capabilities are available.

The gateway does not independently invent trial rules.

```text
Authenticated Account
        ↓
Trial Service
        ↓
Entitlement Service
        ↓
AI Gateway
```

When the trial expires, access follows the subscription/entitlement policy.

---

# 13. Pro Authorization

Aila Pro users receive the entitlements defined by the centralized entitlement service.

The gateway checks the entitlement required for the requested capability.

No client-provided:

```text
plan=pro
```

or equivalent value can grant access.

---

# 14. Usage Control

Before sending a request to a provider, the gateway checks applicable usage limits.

Examples:

- Request count
- Token allowance
- File processing allowance
- Model access
- Product access
- Rate limit

The gateway should reject requests before provider consumption when the account is not entitled to continue.

---

# 15. Rate Limiting

Rate limiting protects:

- Aila infrastructure
- AI providers
- Account resources
- Billing economics

Rate limits may operate at several levels:

```text
Account
Product
Endpoint
AI capability
Provider
IP/network
```

Rate-limit state may use Upstash Redis.

Redis is not authoritative for subscription or account state.

---

# 16. Request Validation

AI requests must be validated before provider submission.

Validation includes:

- Request shape
- Product
- Capability
- Input size
- Context size
- File references
- Allowed model class
- Output constraints
- Account authorization

Invalid requests are rejected before provider consumption.

---

# 17. Prompt Construction

Products are responsible for their domain-specific instructions.

The gateway is responsible for enforcing platform-level policy.

Conceptually:

```text
Product Instructions
        +
User Context
        +
Relevant Data
        ↓
Aila AI Request
        ↓
AI Gateway
```

The gateway should not contain every product's business logic.

---

# 18. Context Management

The gateway must support structured context.

Possible context sources:

- Current user request
- Conversation history
- Project context
- Retrieved documents
- Product state
- Tool results

Large context should be controlled to avoid unnecessary token consumption.

---

# 19. Retrieval-Augmented Generation

When a product requires project/document knowledge:

```text
User Request
     ↓
Authorization
     ↓
Qdrant Retrieval
     ↓
Authorized Context
     ↓
AI Gateway
     ↓
Model
```

Retrieval must always be scoped to the authorized account/project.

The AI model must never receive unauthorized context.

---

# 20. File Context

The gateway may receive references to uploaded files.

The gateway or an upstream service must verify:

- File ownership
- File availability
- Processing state
- Supported content type
- Entitlement
- Project authorization

A file ID alone does not grant access.

---

# 21. Streaming

The gateway should support streaming responses where supported by the selected provider and product workflow.

Streaming must preserve:

- Authorization
- Error handling
- Usage tracking
- Cancellation
- Timeouts

A disconnected client must not leave uncontrolled provider activity running indefinitely.

---

# 22. Timeouts

Every provider request requires bounded timeouts.

Timeouts must be configured according to operation type.

Examples:

```text
short_generation
long_reasoning
document_analysis
streaming
```

Timeout values belong in server configuration.

They must not be controlled by arbitrary client input.

---

# 23. Retry Policy

Retries are allowed only for appropriate transient failures.

Potential retry conditions:

- Temporary network failures
- Provider availability failures
- Rate-limit responses where retry timing permits
- Transient infrastructure errors

Do not blindly retry:

- Invalid requests
- Authentication failures
- Authorization failures
- Unsupported models
- Malformed input

Retries must have bounded attempts.

---

# 24. Idempotency

Operations that can cause duplicate side effects require idempotency.

Examples:

- AI jobs
- File processing
- Billing-related AI workflows
- Background generation tasks

Where applicable, requests should carry an internal idempotency identifier.

---

# 25. Error Normalization

Provider-specific errors must not leak directly into product code.

The gateway converts provider failures into Aila-defined error categories.

Example:

```text
AI_AUTHENTICATION_ERROR
AI_RATE_LIMITED
AI_TIMEOUT
AI_PROVIDER_UNAVAILABLE
AI_MODEL_UNAVAILABLE
AI_INVALID_REQUEST
AI_CONTEXT_TOO_LARGE
AI_CONTENT_RESTRICTED
AI_INTERNAL_ERROR
```

Products can then handle consistent Aila errors.

---

# 26. Provider Failover

The architecture should support provider/model fallback where appropriate.

Conceptually:

```text
Primary Model
     ↓
Failure
     ↓
Fallback Policy
     ↓
Alternative Model / Provider
```

Failover must respect:

- User entitlement
- Capability
- Privacy requirements
- Cost policy
- Model quality requirements
- Provider availability

Not every operation is eligible for automatic fallback.

---

# 27. Cost Control

The gateway tracks AI usage and estimated cost where provider information allows.

Cost controls may include:

- Maximum token budgets
- Model restrictions
- Request limits
- Product limits
- Account limits
- Trial limits

The gateway must prevent accidental unbounded provider usage.

---

# 28. Usage Recording

After an AI operation, the gateway records usage metadata.

Possible fields:

```text
account_id
product_type
provider
model
request_type
input_tokens
output_tokens
total_tokens
estimated_cost
duration_ms
status
created_at
```

Usage recording must not expose sensitive prompt content unnecessarily.

---

# 29. Privacy

The gateway must minimize sensitive logging.

Do not automatically log complete:

- Legal documents
- Private conversations
- Source code
- Business plans
- Uploaded files
- User prompts
- AI responses

unless the specific product/system requirement explicitly requires storage.

Operational telemetry should prefer metadata.

---

# 30. AI Request Storage

Conversation messages belong to the appropriate product/application data model.

They should not be duplicated automatically into an AI gateway log table.

This prevents unnecessary duplication of sensitive information.

---

# 31. Observability

The gateway must provide operational visibility into:

- Request counts
- Success/failure rates
- Latency
- Provider failures
- Model failures
- Token usage
- Estimated cost
- Rate limits
- Timeouts
- Retries
- Fallbacks

Observability data must minimize sensitive content.

---

# 32. Correlation IDs

AI operations should have a correlation/request ID.

Conceptually:

```text
User Request
     ↓
request_id
     ↓
Product
     ↓
AI Gateway
     ↓
Provider
```

The identifier allows troubleshooting across services without storing the user's entire request in operational logs.

---

# 33. Security Boundaries

Provider API keys exist only server-side.

```text
Browser
   X
   │
   └── No provider credentials

Aila Server
   │
   └── Provider credentials
```

Environment secrets must be managed separately for:

- Development
- Staging
- Production

---

# 34. AI Gateway Service Structure

The implementation should maintain clear separation between:

```text
ai/
├── gateway/
├── providers/
├── models/
├── policies/
├── usage/
├── errors/
└── types/
```

Provider adapters should implement a common internal contract.

---

# 35. Provider Adapter Contract

Conceptually:

```text
ProviderAdapter

authenticate()
listCapabilities()
generate()
stream()
estimateUsage()
normalizeError()
```

The exact interface will be finalized during implementation.

The contract must prevent provider-specific details from leaking into product domains.

---

# 36. Product Integration

Each product uses the common Aila AI interface.

Examples:

```text
Intelligence → AI Gateway
Writer       → AI Gateway
Translate    → AI Gateway
Ads          → AI Gateway
Legal        → AI Gateway
Coding       → AI Gateway
```

No product receives direct provider credentials.

---

# 37. Product-Specific AI Policies

Each product may define:

- System instructions
- Tool definitions
- Context rules
- Output schemas
- Model capability requirements
- Retrieval strategy
- Safety requirements

These policies belong to the product domain.

The gateway enforces platform-level controls.

---

# 38. Structured Outputs

Where a product requires predictable machine-readable output, the gateway should support structured output contracts.

Examples:

- Campaign objects
- Translation metadata
- Legal findings
- Coding analysis
- Writer operations

Structured output validation must occur before the result is treated as trusted application data.

---

# 39. Tool Use

AI tools must be explicitly registered and authorized.

The model must not gain arbitrary access to Aila services.

Each tool requires:

- Defined input schema
- Authorization
- Validation
- Execution boundary
- Output schema
- Error handling
- Auditability where appropriate

---

# 40. Coding Execution Boundary

Aila Coding may eventually execute generated code.

Generated or user-provided code must never execute directly on the main Next.js application server.

Future execution architecture:

```text
Aila Coding
     ↓
Execution Service
     ↓
Isolated Sandbox
     ↓
Resource Limits
     ↓
Execution Result
```

The sandbox must have:

- Network controls
- CPU limits
- Memory limits
- Time limits
- Filesystem isolation
- Process isolation
- Automatic cleanup

This is required before arbitrary code execution is enabled.

---

# 41. Image, Audio, and Video AI

Media generation and analysis use the same gateway philosophy.

```text
Product
   ↓
Aila AI Gateway
   ↓
Capability
   ↓
Approved Provider
```

Media-specific provider integrations must not bypass the gateway.

Media operations must also account for:

- File size
- Processing time
- Storage
- Usage limits
- Cost
- Content policies

---

# 42. AI Gateway Invariants

The following rules are mandatory.

1. Every AI request passes through the gateway.
2. Products never hold provider credentials.
3. Product code never directly calls OpenRouter.
4. Subscription state is not determined by the gateway itself.
5. Entitlements come from the centralized entitlement service.
6. Usage is checked before expensive operations where possible.
7. Usage is recorded after operations.
8. Sensitive content is not unnecessarily logged.
9. Provider errors are normalized.
10. Provider-specific APIs remain behind adapters.
11. AI context is authorization-scoped.
12. Vector retrieval is authorization-scoped.
13. Client input cannot override model policy.
14. Client input cannot override usage limits.
15. Client input cannot grant access to restricted models.
16. Arbitrary code never executes on the primary application server.

---

# 43. Production AI Flow

The complete production flow is:

```text
                         USER
                           │
                           ▼
                        PRODUCT
                           │
                           ▼
                    Aila AI Interface
                           │
                           ▼
                      AI Gateway
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
          Auth Check   Entitlement   Usage Check
              │            │            │
              └────────────┼────────────┘
                           ▼
                     Model Policy
                           │
                           ▼
                    Context Assembly
                           │
                           ▼
                    Provider Adapter
                           │
                           ▼
                       OpenRouter
                           │
                           ▼
                         Model
                           │
                           ▼
                     AI Response
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        Usage Recording            Product Result
```

---

# 44. v1.0 Goal

The Aila AI Gateway provides one secure, observable, provider-independent AI infrastructure layer for all six Aila products.

It allows Aila to change models and providers without rebuilding product architecture while maintaining centralized:

- Security
- Entitlements
- Usage
- Cost control
- Reliability
- Observability
- Privacy controls

The AI Gateway is a permanent part of the Aila v1.0 production architecture.