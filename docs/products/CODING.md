# Aila Coding — V1 Product Specification

**Product:** Aila Coding  
**Release:** Aila V1.0  
**Status:** Production Specification  
**Parent Product:** Aila  
**Brand:** Aila — think, create, and build.

---

## 1. Purpose

Aila Coding is Aila's production development workspace for understanding, creating, modifying, debugging, reviewing, testing, and documenting software.

It is designed to help users work with real software projects while preserving user control over source code and project changes.

Aila Coding must operate through Aila's centralized AI Gateway and shared authorization, entitlement, usage, storage, observability, and security systems.

Aila Coding is not a separate application, account system, billing system, or AI provider integration.

---

# 2. V1 Product Scope

Aila Coding V1 includes:

- Coding projects
- Project workspaces
- Source files
- Folder/tree navigation
- Code viewing
- Code search
- Project search
- Code understanding
- Code generation
- Code editing
- Refactoring
- Debugging assistance
- Error explanation
- Architecture assistance
- Test generation
- Test explanation
- Documentation generation
- Code review assistance
- Repository/project context
- Project instructions and conventions
- File uploads/imports
- AI-assisted changes
- Reviewable diffs
- Version/history support
- Secure project storage
- AI Gateway integration
- Usage tracking
- Entitlement enforcement
- Trial enforcement
- Project-level access control
- Auditability
- Secure handling of secrets
- Responsive web experience
- PWA support
- Accessibility
- Production monitoring
- Security testing

---

# 3. V1 Non-Goals

The following are not required for Aila Coding V1:

- Automatic GitHub publishing
- Automatic GitLab publishing
- Autonomous repository deployment
- Autonomous production deployments
- Autonomous infrastructure changes
- Autonomous cloud-account modification
- Autonomous credential management
- Automatic package publishing
- Automatic marketplace publishing
- Unrestricted server-side code execution
- Running arbitrary user code on the Aila application server
- Unrestricted shell access
- Persistent remote development machines
- Cryptocurrency mining or unrelated compute workloads
- Guaranteed correctness of generated code
- Guaranteed security of generated code
- Replacement of professional software engineering judgment

GitHub and GitLab integrations may be introduced in a later release through explicitly designed integrations.

---

# 4. Supported Technologies

V1 supports coding assistance for:

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

The system should remain extensible so additional languages and frameworks can be introduced without redesigning the product architecture.

Language and framework support must be represented through configuration/capability metadata rather than scattered hardcoded conditions.

---

# 5. User Journey

Primary journey:

```text
Aila Account
    ↓
Aila Coding
    ↓
Create Coding Project
    ↓
Create or import project files
    ↓
Open project workspace
    ↓
Understand / create / edit / debug code
    ↓
Review AI-generated changes
    ↓
Apply approved changes
    ↓
Continue development
```

The user must remain in control of changes.

AI-generated modifications must be reviewable before destructive or material changes are committed to the user's project state.

---

# 6. Coding Projects

Each Coding project belongs to an authorized Aila account and may optionally be associated with an authorized user/project context.

A Coding project may contain:

- Project name
- Description
- Technology metadata
- Project instructions
- Source files
- Folders
- Configuration metadata
- Documentation
- Test files
- Reference files
- AI context configuration
- Version history
- Activity metadata

Project ownership and access must be enforced server-side.

No project may be accessible solely because a user knows or guesses a project identifier.

---

# 7. Project Workspace

The workspace should provide a production-quality development interface.

Primary areas:

```text
┌─────────────────────────────────────────────┐
│ Project / Workspace                         │
├──────────────┬──────────────────────────────┤
│ File Tree    │ Editor / File Content        │
│              │                              │
│              │                              │
├──────────────┴──────────────────────────────┤
│ AI / Review / Problems / Output / History   │
└─────────────────────────────────────────────┘
```

The exact UI may evolve, but the underlying capabilities must remain clearly separated.

The workspace must support:

- File tree navigation
- File opening
- File creation
- File renaming
- File deletion
- Folder creation
- Search
- Editor interaction
- AI assistance
- Change review
- Version/history access
- Project instructions
- Error/problem presentation

---

# 8. Source Files

Files are first-class persistent project objects.

Each file should have:

- Stable identifier
- Project identifier
- Parent folder identifier where applicable
- Path
- Name
- Extension/language metadata
- Content or secure content reference
- Size
- Version
- Created timestamp
- Updated timestamp
- Deleted state where soft deletion is required
- Ownership/access context

File paths must be normalized and validated.

Path traversal must never be permitted.

Examples that must be rejected include attempts equivalent to:

```text
../../secret
../../../etc/passwd
```

---

# 9. File Operations

Supported operations:

- Create
- Read
- Update
- Rename
- Move
- Delete
- Restore where supported
- Duplicate where supported

Operations must be authorized against the project and account.

Material changes must use transaction boundaries where multiple records are affected.

Concurrent editing must use stale-write protection.

A client must not silently overwrite a newer server version.

---

# 10. Autosave and Persistence

Coding work must not depend on browser memory for persistence.

Where autosave is enabled:

- Changes are persisted through the application backend.
- Save state is visible to the user.
- Failed saves are surfaced.
- Retry behavior is controlled.
- Concurrent edits are protected.
- Stale writes are rejected or reconciled safely.

The system must never falsely display a successful save when persistence failed.

---

# 11. Version History

Meaningful file/project versions should be retained according to the configured retention policy.

Version history must support:

- Previous versions
- Change timestamps
- Change source
- User/AI attribution where applicable
- Diff inspection
- Restore

Restoring a previous version must not silently destroy the existing history.

A restore operation should create a new state/version representing the restoration.

---

# 12. Code Understanding

Aila Coding must be able to assist with understanding existing code.

Supported operations include:

- Explain file
- Explain function
- Explain class
- Explain module
- Explain error
- Explain dependency
- Explain architecture
- Identify relationships
- Summarize project structure
- Identify likely entry points
- Explain data flow
- Explain control flow
- Explain unfamiliar syntax
- Explain configuration

The AI must distinguish between:

- Observed source facts
- Inferences
- Assumptions
- Unknown information

It must not present an inferred architecture as confirmed fact.

---

# 13. Code Generation

Users may request:

- New files
- Functions
- Components
- Classes
- Queries
- API handlers
- Tests
- Documentation
- Configuration
- Refactors
- Boilerplate
- Example implementations

Generated code must be returned through the Aila AI Gateway.

The system must not expose provider API credentials to the browser.

Generated code should be associated with its project context and user request where appropriate for auditability and usage accounting.

---

# 14. Code Editing

Users may ask Aila to modify existing code.

Supported operations include:

- Rewrite
- Refactor
- Optimize
- Simplify
- Fix
- Add functionality
- Remove functionality
- Rename symbols
- Improve readability
- Add validation
- Add error handling
- Add comments
- Add types
- Convert syntax
- Upgrade implementation patterns

AI changes must be reviewable.

Preferred flow:

```text
Existing Code
     ↓
AI Proposed Change
     ↓
Diff
     ↓
User Review
     ↓
Apply
     ↓
Persist New Version
```

The system must not silently replace substantial user code without an explicit user-controlled action.

---

# 15. Diff and Change Review

AI-generated changes must support a reviewable representation.

A diff should identify:

- Added content
- Removed content
- Modified content
- Target file
- Operation
- Change status

The user must be able to:

- Review
- Accept
- Reject
- Cancel
- Apply selected changes where supported

If an operation modifies multiple files, the user must be able to understand the affected file set before applying the change.

---

# 16. Refactoring

Refactoring assistance may include:

- Extract function
- Extract component
- Rename
- Move code
- Reduce duplication
- Improve structure
- Improve typing
- Separate concerns
- Simplify logic
- Improve maintainability

Aila must avoid claiming that a refactor is behavior-preserving unless the available evidence supports that conclusion.

When tests are unavailable, the product should explicitly communicate that limitation.

---

# 17. Debugging

Aila Coding should support debugging from:

- Error messages
- Stack traces
- Source files
- Logs supplied by the user
- Test failures
- Configuration
- Dependency information
- Relevant project context

Debugging assistance should provide:

1. Observed error
2. Relevant context
3. Possible causes
4. Evidence supporting each possibility
5. Recommended investigation
6. Proposed fix
7. Tests or validation steps

The system must not invent logs, stack traces, runtime behavior, or test results.

---

# 18. Testing Assistance

Aila Coding supports:

- Unit-test generation
- Integration-test generation
- End-to-end test generation
- Test explanation
- Test improvement
- Missing-test identification
- Edge-case identification
- Regression-test suggestions

Generated tests must be clearly identified as generated until actually executed and validated.

The product must never claim:

```text
Tests pass
```

unless tests were actually executed through an authorized execution environment and the result is available.

---

# 19. Code Review

Aila Coding may review code for:

- Correctness risks
- Maintainability
- Readability
- Security concerns
- Error handling
- Performance considerations
- Testing gaps
- API design
- Dependency concerns

Reviews must distinguish:

- Confirmed issues
- Likely issues
- Suggestions
- Questions requiring developer verification

Security-related findings must avoid overstating certainty.

---

# 20. Architecture Assistance

Aila Coding can assist with:

- Application architecture
- Module boundaries
- Service boundaries
- API design
- Database design
- Data flow
- Authentication architecture
- Authorization architecture
- Caching
- Queues
- Background jobs
- Testing architecture
- Deployment architecture
- Dependency structure

Architecture recommendations must respect the user's actual project context when available.

The AI must not assume technologies or infrastructure that are not present in the project unless clearly presenting them as proposed alternatives.

---

# 21. Documentation

Supported documentation generation includes:

- README files
- API documentation
- Function documentation
- Architecture documentation
- Setup instructions
- Configuration documentation
- Developer guides
- Code comments
- Test documentation
- Changelogs

Generated documentation must not claim unsupported behavior.

---

# 22. Project Context

Aila Coding requires controlled project context assembly.

Relevant context may include:

- Open file
- Selected code
- Related files
- Project tree
- Project instructions
- Dependencies
- Configuration
- Documentation
- Relevant history
- User-provided requirements
- Retrieved project knowledge

Context selection must be deliberate.

The system must not indiscriminately send the entire project to an AI provider for every request.

---

# 23. Project Instructions

Each Coding project may define persistent instructions such as:

- Coding conventions
- Naming conventions
- Framework preferences
- Testing requirements
- Architecture constraints
- Documentation requirements
- Formatting requirements
- Security requirements

Project instructions must be stored securely and included in AI context only when appropriate.

User-provided project instructions must not override higher-priority platform security rules.

---

# 24. Retrieval and RAG

Aila Coding may use retrieval for large projects.

Vectorized project content must be scoped by:

```text
Account
  ↓
Project
  ↓
Authorized resources
```

Retrieval results must never cross account boundaries.

Relevant source references should be retained so the AI can identify which project files informed an answer.

Deleted or unauthorized files must not remain retrievable through stale vector records.

---

# 25. AI Gateway

All AI operations must use the centralized Aila AI Gateway.

Flow:

```text
Aila Coding
    ↓
Aila AI Interface
    ↓
AI Gateway
    ↓
Authentication
    ↓
Authorization
    ↓
Entitlement
    ↓
Rate Limit
    ↓
Coding Policy
    ↓
Context Assembly
    ↓
Model Routing
    ↓
Provider
    ↓
Response Validation
    ↓
Usage Recording
    ↓
Aila Coding
```

Aila Coding must never call an AI provider directly.

Provider credentials must remain server-side.

---

# 26. Model Routing

Model selection must be capability-based.

Possible capabilities include:

- Code generation
- Code reasoning
- Long-context analysis
- Fast explanation
- Structured output
- Multimodal analysis where supported

Routing decisions may consider:

- Product
- Operation
- Context size
- Required capability
- Entitlement
- Usage limits
- Cost policy
- Provider availability

Provider names must not be hardcoded throughout product features.

---

# 27. Streaming

AI responses may stream to the client.

Streaming must support:

- Request authentication
- Authorization
- Cancellation
- Timeouts
- Provider failure handling
- Partial response handling
- Usage recording
- Correlation IDs

A disconnected browser must not cause uncontrolled backend/provider activity.

---

# 28. Long-Running Operations

Operations that exceed interactive response limits must become controlled asynchronous jobs.

Examples:

- Large project analysis
- Large codebase indexing
- Large documentation generation
- Multi-file analysis
- Large test-generation operations

Jobs require:

- Stable job identifier
- Authorization
- Status
- Progress where meaningful
- Retry policy
- Failure state
- Completion state
- Cancellation where supported
- Observability
- Notification where appropriate

---

# 29. Code Execution Boundary

Arbitrary code execution is a high-risk capability.

If execution is included in a future or V1 implementation, it must occur exclusively inside an isolated execution boundary.

It must never execute arbitrary user code directly on:

- The Next.js application server
- The API server
- The database server
- The worker host running trusted application logic
- Any privileged infrastructure host

A production execution sandbox must provide appropriate isolation for:

- Filesystem
- Network
- CPU
- Memory
- Runtime duration
- Processes
- System calls
- Credentials
- Secrets

Execution must use least privilege.

No application secret may be exposed to user code.

If a production-grade sandbox is not available, code execution must not be enabled.

---

# 30. Terminal and Shell Access

Interactive terminal access is not automatically part of V1.

If introduced, it must use the isolated execution boundary described above.

It must not provide unrestricted access to the Aila host environment.

Commands must operate within the user's authorized project context and sandbox.

Host filesystem access is prohibited.

---

# 31. Dependencies

Dependency information may be used for project understanding.

Aila Coding may identify:

- Dependency versions
- Potentially outdated dependencies
- Dependency relationships
- Known configuration issues where reliable information is available

The product must distinguish between:

- Detected dependency information
- Security intelligence
- AI-generated recommendations

Dependency upgrades must remain reviewable and must not be silently applied.

---

# 32. Secrets Protection

Aila Coding must actively protect secrets.

Potential secrets include:

- API keys
- Access tokens
- Passwords
- Private keys
- Database credentials
- Cloud credentials
- Environment secrets
- Session tokens

Secrets must not be intentionally included in AI prompts unless explicitly supported by a future security design.

Sensitive values should be redacted before external provider transmission where applicable.

Secrets must never appear in:

- Client-side source
- Standard application logs
- Analytics events
- Error reports
- AI usage metadata
- Audit records

---

# 33. Prompt Injection Protection

Code repositories can contain hostile instructions inside:

- Source files
- README files
- Comments
- Documentation
- Configuration
- Generated files
- Dependencies
- Uploaded documents

Repository content must be treated as untrusted data.

Instructions discovered inside project content must not automatically become system instructions.

The AI Gateway must maintain a clear distinction between:

```text
Trusted system policy
Trusted application instructions
User instructions
Untrusted project content
```

---

# 34. File Upload and Import

Users may import project material through supported upload mechanisms.

Uploads must pass through the shared secure file pipeline.

Controls include:

- Authentication
- Authorization
- File-size limits
- File-type validation
- Filename/path validation
- Malware/security scanning where applicable
- Storage isolation
- Processing isolation
- Metadata validation
- Access control
- Retention policy

Uploaded files must never become publicly accessible by default.

---

# 35. GitHub and GitLab Boundary

GitHub and GitLab integration is a future capability.

When introduced, integrations must:

- Use explicit user authorization
- Use minimum required permissions
- Store provider credentials securely
- Support revocation
- Audit repository actions
- Clearly identify external changes
- Respect repository permissions
- Avoid autonomous production deployment by default

V1 must not pretend that a repository integration exists if it has not been implemented and validated.

---

# 36. Usage and Entitlements

Aila Coding uses the centralized Aila entitlement system.

Relevant entitlements include:

```text
coding
projects
file_upload
advanced_models
```

The frontend must not determine entitlement eligibility.

Server-side authorization must determine whether an operation is permitted.

The three-hour trial is server-authoritative.

After trial expiration, continued Pro usage requires an active Aila Pro entitlement.

Usage must be recorded consistently with the central usage architecture.

---

# 37. Usage Tracking

Usage records should capture appropriate operational metadata such as:

- Account
- User
- Product
- Operation
- Model
- Provider
- Request identifier
- Token usage where available
- Estimated cost where available
- Duration
- Status
- Timestamp

Source code and sensitive project contents must not be copied into usage telemetry unnecessarily.

---

# 38. Privacy

Coding projects may contain:

- Proprietary source code
- Business logic
- Credentials
- Customer data
- Internal documentation
- Personal information

Therefore:

- Data access must be authorization-controlled.
- Provider transmission must be deliberate.
- Sensitive content must not be logged unnecessarily.
- Retention must be documented.
- Deletion must propagate appropriately.
- Analytics must not capture source code by default.
- Error reporting must avoid sensitive source content where possible.

---

# 39. Auditability

Security-relevant Coding actions should be auditable.

Examples:

- Project creation
- Permission changes
- File import
- File deletion
- AI-assisted change application
- Project deletion
- External integration authorization
- Sensitive configuration changes

Audit logs must contain sufficient metadata for investigation without becoming a repository-content logging system.

---

# 40. Error Handling

Errors must be normalized.

The client should receive safe user-facing errors rather than provider internals, stack traces, credentials, or infrastructure details.

Categories may include:

- Authentication failure
- Authorization failure
- Entitlement failure
- Validation failure
- File failure
- AI provider failure
- Timeout
- Rate limit
- Conflict
- Storage failure
- Background-job failure
- Execution failure

Errors must be observable internally with correlation IDs.

---

# 41. Retry and Idempotency

Retries must be deliberate.

Safe retry candidates may include transient:

- Provider failures
- Network failures
- Storage failures
- Queue failures

Non-idempotent operations must not be blindly retried.

AI requests requiring durable side effects must use idempotency controls where appropriate.

---

# 42. Responsive and PWA Requirements

Aila Coding is part of the Aila web application and must work across supported desktop, tablet, and mobile layouts.

Desktop is the primary environment for intensive coding workflows, but the application must remain usable on smaller screens.

The PWA must provide:

- Valid manifest
- Application icons
- HTTPS
- Install metadata
- Responsive UI
- Accessible controls
- Safe caching strategy
- Correct update behavior

Offline behavior must never imply that unsynchronized code changes have been safely persisted.

---

# 43. Accessibility

Aila Coding must support:

- Keyboard navigation
- Visible focus states
- Semantic controls
- Accessible names
- Screen-reader-compatible navigation
- Sufficient contrast
- Accessible dialogs
- Accessible notifications
- Accessible file operations
- Reduced-motion considerations

The code editor must not become the only way to access important information.

---

# 44. Performance

Performance requirements include:

- Fast project navigation
- Efficient file loading
- Efficient search
- Incremental rendering for large projects
- Controlled context assembly
- Streaming AI responses
- Background processing for expensive operations
- Avoidance of unnecessary full-project transfers
- Appropriate caching

Large projects must not cause the browser to load all files into memory unnecessarily.

---

# 45. Database Architecture

PostgreSQL is the authoritative transactional data store.

Coding-related records should use Prisma migrations.

Potential models include:

```text
CodingProject
CodingProjectMember
CodingFile
CodingFolder
CodingFileVersion
CodingChange
CodingChangeFile
CodingProjectInstruction
CodingAnalysis
CodingJob
CodingReference
```

Exact schema implementation must be finalized against the shared Aila data architecture before migrations are created.

There must be no competing database source of truth.

---

# 46. Data Integrity

Coding operations must enforce:

- Foreign keys
- Unique constraints
- Ownership constraints
- Authorization checks
- Transaction boundaries
- Timestamp consistency
- Version consistency
- Referential integrity

Deletion must account for:

- Files
- Versions
- Changes
- Jobs
- Search indexes
- Vector records
- Stored assets
- Audit records where retention requires preservation

---

# 47. Observability

Production monitoring must cover:

- AI request failures
- Provider latency
- Streaming failures
- File operation failures
- Save failures
- Search latency
- Background jobs
- Storage errors
- Authorization failures
- Rate limiting
- Execution failures if enabled
- Unexpected error rates

Metrics must avoid exposing source-code content.

Correlation IDs must allow a request to be traced across relevant services without exposing sensitive user content.

---

# 48. Security Testing

Security testing must include:

- Cross-account access attempts
- Unauthorized project access
- Unauthorized file access
- Path traversal
- Malicious filenames
- Upload abuse
- Prompt injection
- Secret leakage
- XSS
- CSRF
- Authorization bypass
- Rate-limit bypass
- AI Gateway bypass
- RAG isolation
- Concurrent-write conflicts
- Project deletion behavior
- Sandbox escape attempts if execution exists

Any arbitrary execution capability must receive dedicated isolation and escape testing before production enablement.

---

# 49. Test Strategy

Aila Coding requires:

### Unit Tests

For:

- Validation
- Path normalization
- Authorization rules
- Entitlement checks
- Diff generation
- Context selection
- Redaction
- Domain logic

### Integration Tests

For:

- Database operations
- Project ownership
- File lifecycle
- Versioning
- AI Gateway
- Usage recording
- RAG isolation
- Background jobs

### End-to-End Tests

For:

- Create project
- Create file
- Edit file
- Save file
- Generate change
- Review diff
- Apply change
- Restore version
- Search project
- Delete project

### Security Tests

For all security boundaries described above.

---

# 50. Production Acceptance Criteria

Aila Coding V1 is accepted only when:

- A user can create a Coding project.
- Project ownership is enforced.
- Authorized users can access only permitted projects.
- Users can create, read, update, rename, move, and delete files according to authorization.
- File paths are validated against traversal attacks.
- Code changes persist reliably.
- Stale writes cannot silently overwrite newer changes.
- Version history works according to the defined retention model.
- AI requests pass exclusively through the Aila AI Gateway.
- Entitlements are enforced server-side.
- Trial restrictions are enforced server-side.
- Usage is recorded correctly.
- AI-generated changes are reviewable.
- Material changes are not silently applied.
- Generated tests are not represented as executed tests without actual execution.
- The system does not fabricate logs, test results, or project behavior.
- Project retrieval is account/project scoped.
- Deleted or unauthorized content cannot be retrieved through stale indexes.
- Secrets are protected.
- Repository content is treated as untrusted input.
- Provider credentials never reach the browser.
- Errors do not expose sensitive infrastructure details.
- Production monitoring covers critical Coding workflows.
- Required automated tests pass.
- Security tests pass.
- PWA requirements pass.
- Accessibility requirements pass.
- Production deployment configuration is documented.
- Backup and recovery procedures cover Coding data.
- Account/project deletion behavior is documented and tested.

---

# 51. Critical Release Blockers

Aila Coding V1 must not ship if any of the following exists:

- Cross-account project access
- Cross-project unauthorized file access
- Exposed AI provider credentials
- Exposed application secrets
- Authentication bypass
- Authorization bypass
- Trial bypass
- Entitlement bypass
- Uncontrolled arbitrary code execution
- Host filesystem access from user code
- Sandbox escape
- Path traversal
- Public exposure of private source code
- Unsafe external repository authorization
- Unprotected sensitive source-code logging
- RAG isolation failure
- Silent destructive AI changes
- Corrupted version history
- Broken persistence
- Unverified backup/recovery
- Critical security vulnerability
- Production data corruption
- Inability to monitor critical failures

---

# 52. Production Invariants

The following invariants must always hold:

1. Every Coding project belongs to an authorized Aila account.
2. Every Coding operation is authorization-checked server-side.
3. Users cannot access another account's project data.
4. AI requests go through the Aila AI Gateway.
5. Provider credentials remain server-side.
6. Trial and entitlement state is server-authoritative.
7. Usage is centrally tracked.
8. Project content is treated as potentially untrusted input.
9. AI-generated changes remain under user control.
10. Arbitrary user code never executes on the main Aila application server.
11. If execution is enabled, it occurs only inside an approved isolated execution boundary.
12. Private source code is never publicly exposed by default.
13. Deleted content cannot remain accessible through stale retrieval paths.
14. Secrets are not intentionally persisted in ordinary logs or analytics.
15. Generated code is not represented as verified code without evidence.
16. Generated tests are not represented as executed tests without actual execution.
17. The database remains the authoritative transactional source of truth.
18. Production environments remain isolated from development environments.
19. Security-critical failures block release.
20. Aila Coding remains part of the single Aila account and entitlement system.

---

# 53. Production Definition of Done

Aila Coding V1 is complete only when the feature set is implemented against the production architecture and all applicable acceptance criteria pass.

Completion requires:

- Product implementation
- Shared authentication
- Authorization
- Entitlements
- Trial enforcement
- Database schema
- Secure storage
- AI Gateway integration
- Usage tracking
- Versioning
- Change review
- Error handling
- Observability
- Security controls
- Automated tests
- PWA behavior
- Accessibility
- Deployment configuration
- Backup/recovery readiness
- Documentation
- Security review
- Production acceptance testing

A feature is not considered complete merely because the UI renders or an AI response can be demonstrated.

---

# 54. Final Product Boundary

Aila Coding V1 is a controlled, production-grade AI-assisted software development workspace.

Its core principle is:

> **Aila helps the user understand and change software while keeping source code, execution, credentials, project access, and consequential actions under explicit security and user-control boundaries.**

The product must prioritize:

- Correctness
- Security
- User control
- Privacy
- Traceability
- Reviewability
- Reliability
- Production readiness

No shortcut that weakens these properties qualifies as a production implementation of Aila Coding V1.