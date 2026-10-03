# Aila Translate — V1 Product Specification

**Product:** Aila Translate  
**Release:** Aila V1.0  
**Status:** Production Specification  
**Parent Product:** Aila  
**Canonical Repository:** `/home/aila/Projects/Aila`

---

# 1. Purpose

Aila Translate is Aila's contextual multilingual translation workspace.

It is designed for users who need more than literal word substitution.

Translate must preserve, where appropriate:

- meaning;
- context;
- tone;
- terminology;
- formatting;
- document structure;
- intended audience;
- language-specific conventions.

The product must allow users to translate individual text, structured content, and supported documents while retaining control over the resulting translation.

---

# 2. Product Role

Aila Translate operates inside the user's existing Aila account.

It shares:

- authentication;
- account ownership;
- subscription;
- 3-hour trial;
- centralized entitlements;
- AI Gateway;
- file storage;
- usage tracking;
- notifications;
- security;
- observability;
- audit infrastructure.

Translate must not implement an independent account or subscription system.

---

# 3. V1 Scope

Translate V1 includes:

- text translation;
- automatic language detection;
- manual source-language selection;
- target-language selection;
- multiple target languages where supported by the UI/workflow;
- contextual translation;
- formal/informal tone control;
- terminology guidance;
- translation instructions;
- side-by-side source and translation views;
- editable translated output;
- translation history;
- document translation for supported formats;
- project-based translation;
- reference/context files;
- translation memory within the authorized project where implemented;
- search;
- export;
- usage tracking;
- entitlement enforcement;
- responsive UI;
- PWA compatibility;
- accessibility;
- privacy and security;
- observability;
- automated testing.

---

# 4. V1 Non-Goals

Translate V1 does not include:

- certified legal translation;
- sworn translation;
- official government certification;
- guaranteed professional translation;
- autonomous publication;
- unrestricted batch translation;
- unlimited translation volume;
- unsupported file formats;
- public translation sharing by default;
- direct third-party localization platform publishing unless separately implemented;
- automatic claims of legal equivalence between translations.

Translate assists with translation but does not certify that a translation satisfies a legal, regulatory, immigration, contractual, medical, or other official requirement.

---

# 5. Primary User Outcomes

A successful Translate user can:

1. Enter or upload content.
2. Identify or select the source language.
3. Select a target language.
4. Provide context and translation instructions.
5. Translate the content.
6. Review source and translated versions together.
7. Edit the translated result.
8. Preserve terminology across a project.
9. Save translation history.
10. Export the translated content.

---

# 6. Translation Workspace

The primary workspace should provide:

```text id="7h6z6m"
Translate
├── New Translation
├── Recent Translations
├── Projects
├── Translation Editor
├── Source Language
├── Target Language
├── Context / Instructions
├── Terminology
├── Reference Files
├── Translation History
├── Search
└── Export
```

The visual design may evolve while these functional responsibilities remain intact.

---

# 7. Translation Modes

Translate should support two primary workflows.

## 7.1 Text Translation

The user provides text directly.

Flow:

```text id="x8x1zj"
Source Text
 ↓
Language Detection / Selection
 ↓
Target Language
 ↓
Context & Instructions
 ↓
Translation
 ↓
Review
 ↓
Edit
 ↓
Save / Export
```

## 7.2 Document Translation

The user uploads a supported document.

Flow:

```text id="3v3e5a"
Upload
 ↓
Validation
 ↓
Content Extraction
 ↓
Language Detection
 ↓
Translation Configuration
 ↓
Translation Job
 ↓
Review
 ↓
Export
```

---

# 8. Source Language

The user may:

- allow automatic detection;
- manually select a language;
- change the detected language before translation.

Automatic detection must be treated as a suggestion.

The user must be able to override it.

The system must not silently translate using an incorrect detected language when the user explicitly selected another source language.

---

# 9. Target Language

The user must explicitly select the target language.

The system must validate that the requested language is supported by the selected translation capability/model.

Unsupported combinations must produce a clear error rather than silently substituting another language.

---

# 10. Language Metadata

Languages should use stable internal identifiers rather than arbitrary display strings.

The application should maintain a controlled language registry containing, as appropriate:

- language code;
- display name;
- native name;
- supported capabilities;
- availability status.

The registry must be centrally maintained.

---

# 11. Translation Editor

The editor must support:

- source content;
- translated content;
- side-by-side view on larger screens;
- stacked view on smaller screens;
- editable translation;
- copy;
- paste;
- undo/redo;
- search;
- replace where supported;
- translation status;
- save state;
- AI actions;
- export.

The source should remain protected from accidental modification when it is being used as the canonical original.

---

# 12. Source Preservation

The original source must be preserved separately from the editable translation.

A translation edit must never overwrite the original source.

The data model should distinguish:

```text id="rj55a5"
Source
Translation
Translation Revision
```

This allows users to return to the original source even after extensive editing.

---

# 13. Translation Revisions

Meaningful translated states should be versioned.

Revision metadata may include:

- revision ID;
- translation ID;
- creator;
- creation timestamp;
- operation;
- model/capability metadata where appropriate.

AI transformations should not destroy previous user-approved content.

---

# 14. Context

Translation quality depends on context.

Users may provide:

- intended audience;
- subject;
- industry;
- geographic context;
- desired tone;
- writing style;
- usage purpose;
- terminology;
- additional instructions.

Example contexts include:

- business;
- marketing;
- technical;
- academic;
- conversational;
- formal;
- customer support.

Context must be treated as user-provided instructions and must not override Aila's higher-priority system rules.

---

# 15. Tone

Translate should support controlled tone guidance.

Examples:

- formal;
- informal;
- neutral;
- professional;
- conversational;
- friendly;
- technical;
- concise.

The UI may use a predefined set plus an optional custom instruction.

Tone controls are guidance, not guarantees.

---

# 16. Terminology

Users may define preferred terminology.

A terminology entry may contain:

- source term;
- preferred translation;
- target language;
- optional prohibited alternative;
- optional explanation;
- project association.

Example:

```text id="i9zv7g"
Source: API
Preferred: API
Language: Spanish
```

Terminology rules must be applied only within their authorized scope.

---

# 17. Terminology Consistency

Where terminology is configured, Translate should prioritize the user's defined terminology.

The system should not silently replace an explicit terminology preference with an alternative.

If a terminology instruction conflicts with language correctness or system constraints, the result should be handled transparently rather than silently misrepresented.

---

# 18. Translation Memory

Where enabled for V1, Translate may maintain reusable translation pairs within an authorized project.

Example:

```text id="1tw5j4"
Source Segment
        ↓
Approved Translation
        ↓
Reusable Project Context
```

Translation memory must be:

- account-scoped;
- project-scoped where applicable;
- explicitly authorized;
- deletable according to data lifecycle rules.

It must never become a cross-account shared dataset.

---

# 19. AI Gateway

All AI translation requests must pass through the Aila AI Gateway.

Translate must never directly call an external model provider.

Required flow:

```text id="c6b4yq"
Translate
 ↓
Translate Service
 ↓
Aila AI Gateway
 ↓
Authentication
 ↓
Authorization
 ↓
Entitlement
 ↓
Rate Limit
 ↓
Capability Validation
 ↓
Context Assembly
 ↓
Model Routing
 ↓
Provider Adapter
 ↓
Provider
```

Provider credentials remain server-side.

---

# 20. Translation Capability

The Gateway should expose a capability-oriented translation interface rather than coupling Translate to a particular provider or model.

Conceptually:

```text id="yq7b2v"
translate_text
translate_document
detect_language
apply_terminology
```

Actual provider/model selection remains an infrastructure concern.

---

# 21. Model Routing

Model selection must be capability-based.

The Gateway may select models based on:

- source language;
- target language;
- content type;
- document size;
- quality requirements;
- latency requirements;
- availability;
- cost policy;
- account entitlement.

The Translate UI should not expose provider-specific implementation details unless intentionally supported as a product feature.

---

# 22. Context Assembly

A translation request may include:

1. system instructions;
2. Aila translation policy;
3. user instructions;
4. source text;
5. source/target language;
6. tone;
7. terminology;
8. project context;
9. authorized reference material.

Only necessary authorized context should be sent to the model.

---

# 23. Formatting Preservation

For supported structured documents, Translate should preserve appropriate formatting such as:

- headings;
- paragraphs;
- lists;
- basic emphasis;
- tables where technically supported;
- document ordering.

The system must not claim perfect formatting preservation for formats or structures that the production pipeline does not support.

---

# 24. Document Translation

Supported document translation must use a controlled pipeline:

```text id="8l7g4s"
Upload
 ↓
Validate
 ↓
Store Securely
 ↓
Extract
 ↓
Normalize
 ↓
Translate
 ↓
Reconstruct
 ↓
Validate
 ↓
Store Output
```

Each stage must have an explicit status.

---

# 25. Large Documents

Large documents should be processed as controlled jobs.

The system must:

- split content safely;
- preserve ordering;
- maintain relevant context;
- prevent duplicated sections;
- track progress;
- handle partial failures;
- retry safe operations;
- produce a final validated result.

The user must not receive a success status until the resulting document is sufficiently validated.

---

# 26. Translation Segmentation

Long content may be segmented into translation units.

Segmentation must preserve:

- order;
- paragraph boundaries;
- relevant context;
- terminology;
- formatting metadata where supported.

The system must avoid blindly translating arbitrary token-sized fragments when doing so could destroy meaning.

---

# 27. AI Output Review

AI-generated translations should remain editable.

Recommended workflow:

```text id="9smw8f"
AI Translation
 ↓
User Review
 ↓
User Edit
 ↓
Approve / Save
```

Translate must not imply that model output is automatically perfect.

---

# 28. Translation Quality Signals

Where useful, the system may identify potential issues such as:

- untranslated source text;
- inconsistent terminology;
- suspiciously missing content;
- formatting loss;
- language mismatch;
- apparent segmentation problems.

These are quality signals, not certification.

---

# 29. Back Translation / Comparison

Where implemented, Translate may allow users to compare the translation with the source or request an explanatory comparison.

Such functionality must not be presented as proof of correctness.

A back translation can help identify differences but cannot establish that a translation is legally or professionally certified.

---

# 30. History

Translate must maintain authorized translation history.

History should allow users to find:

- previous translations;
- project;
- source language;
- target language;
- title;
- creation date;
- status.

History must be account-scoped.

Deleted content must follow the documented deletion lifecycle.

---

# 31. Search

Search should support authorized:

- translation titles;
- source text metadata;
- target language;
- project;
- terminology;
- translation content where indexed.

Search must respect account and project authorization.

---

# 32. Projects

Users may organize translations into projects.

Examples:

- website localization;
- product documentation;
- multilingual marketing;
- customer support;
- personal language work.

A project may contain:

- translations;
- terminology;
- reference files;
- instructions;
- translation memory where enabled.

---

# 33. Reference Files

Users may provide reference material to improve contextual consistency.

Reference files may include:

- style guides;
- terminology lists;
- product documentation;
- previous translations;
- brand guidelines.

Files must remain private and authorization-scoped.

---

# 34. File Security

Uploaded files must pass through Aila's standard secure file pipeline.

Requirements include:

- file type validation;
- size limits;
- secure storage;
- malware/security scanning where required;
- extraction isolation;
- authorization checks;
- deletion lifecycle;
- auditability.

Unsupported or unsafe files must be rejected.

---

# 35. Search and Retrieval

Where semantic retrieval is used, Translate may use Aila's vector infrastructure.

Every retrieval query must be scoped by the user's authorization.

At minimum, retrieval boundaries must include:

```text id="0z0d9j"
account_id
project_id
authorized resource
```

No cross-account translation memory or reference content may be returned.

---

# 36. Export

Translate should support export of completed translations.

Supported export formats should follow the production capabilities available to Aila.

Where document translation is supported, export should preserve appropriate structure.

The exported result must remain private.

---

# 37. Export Validation

Before reporting export success, the system should validate:

- file creation;
- file readability;
- expected content presence;
- document structure where applicable;
- correct target-language output;
- authorized storage.

Source data must remain unaffected by export failure.

---

# 38. Usage

Translation operations must be tracked centrally.

Usage metadata may include:

- account;
- user;
- product;
- operation;
- source language;
- target language;
- model;
- provider;
- request ID;
- input/output token usage where available;
- latency;
- estimated cost;
- status;
- timestamps.

Raw source content must not be indiscriminately stored in telemetry.

---

# 39. Entitlements

Translate uses the centralized entitlement system.

Example entitlement:

```text id="s3w1ny"
translate
```

Shared entitlements may include:

```text id="7c0t2n"
file_upload
projects
advanced_models
```

Translate must not create a second subscription system.

---

# 40. Trial and Subscription

The Aila 3-hour trial applies to Translate according to the global Aila trial implementation.

The server determines:

- trial status;
- expiry;
- entitlement;
- usage eligibility.

After the trial expires, continued Pro access requires an eligible subscription.

The browser must never be the authoritative source for these decisions.

---

# 41. Rate Limits

Translation operations must respect centralized rate limits.

Rate limits may consider:

- account;
- user;
- operation;
- document size;
- concurrent jobs;
- entitlement;
- infrastructure capacity.

Rate-limit errors must be clear and recoverable.

---

# 42. Privacy

Translation data may contain:

- personal communications;
- contracts;
- business information;
- unpublished material;
- customer information;
- proprietary terminology.

Translate must therefore:

- minimize data retention;
- limit logging;
- protect storage;
- protect AI context;
- isolate accounts;
- support deletion;
- enforce authorization.

---

# 43. Sensitive Content

Translate must not claim that content is automatically confidential beyond Aila's documented privacy and security commitments.

Users should be able to understand when content is processed by external AI infrastructure through Aila's AI Gateway where applicable.

The product must not expose another user's translation content.

---

# 44. Security

Translate must comply with the central Aila security architecture.

Required protections include:

- authentication;
- authorization;
- secure sessions;
- input validation;
- output handling;
- secure file processing;
- rate limiting;
- audit logging;
- AI Gateway controls;
- prompt injection protection;
- secure storage;
- environment isolation.

---

# 45. Prompt Injection

Reference documents are untrusted content.

A reference document may contain instructions that attempt to control the model.

Those instructions must not override:

- Aila system instructions;
- product policies;
- authorization;
- user-selected translation configuration.

Retrieved content must remain data rather than becoming privileged instructions.

---

# 46. Language Detection

Language detection must produce a result with an appropriate confidence representation where supported.

The system must allow the user to override detection.

If the content contains multiple languages, Translate should not silently claim that the entire document is one language when reliable detection indicates otherwise.

---

# 47. Mixed-Language Content

Translate may encounter content containing:

- multiple languages;
- names;
- code;
- URLs;
- product names;
- abbreviations;
- technical terms.

The translation system should preserve content that should not normally be translated where the context requires it.

Users must have a way to provide explicit instructions.

---

# 48. Code and Technical Content

Translate must distinguish ordinary natural-language content from code and technical syntax where possible.

It must not arbitrarily translate:

- variable names;
- programming syntax;
- URLs;
- identifiers;
- structured data.

Technical translation behavior must be conservative.

---

# 49. Error Handling

Translate must provide clear errors for:

- unsupported language;
- failed detection;
- unsupported file;
- extraction failure;
- translation failure;
- timeout;
- rate limit;
- entitlement failure;
- export failure;
- network failure.

Errors must not expose:

- API keys;
- provider credentials;
- internal database information;
- stack traces;
- private infrastructure details.

---

# 50. Streaming

Text translation may use streaming where appropriate.

Streaming must:

- authenticate the request;
- validate authorization;
- validate entitlement;
- maintain usage tracking;
- allow cancellation where practical;
- handle partial output safely.

For document translation, asynchronous jobs may be preferable to browser streaming.

---

# 51. Long-Running Jobs

Document translation jobs must have explicit states.

Recommended states:

```text id="ojk6v7"
QUEUED
PROCESSING
COMPLETED
FAILED
CANCELED
```

State transitions must be controlled server-side.

Duplicate jobs must be prevented or safely deduplicated where required.

---

# 52. Notifications

Users may receive notifications when:

- a document translation completes;
- a translation fails;
- an export completes;
- a long-running job requires attention.

Notifications must be account-scoped.

---

# 53. Responsive Design

Translate must work on:

- desktop;
- laptop;
- tablet;
- supported mobile browsers.

The side-by-side editor must gracefully become a stacked or tabbed interface on narrow screens.

Users must never lose source/translation access merely because the viewport is small.

---

# 54. PWA

Translate must operate correctly inside the Aila PWA.

The implementation must preserve:

- authentication;
- local UI state;
- navigation;
- save state;
- update behavior.

Application updates must not silently discard unsaved translation edits.

---

# 55. Accessibility

Translate must support:

- keyboard navigation;
- visible focus;
- semantic controls;
- screen-reader labels;
- accessible language selectors;
- accessible editor controls;
- accessible progress indicators;
- accessible error states;
- sufficient contrast;
- non-color-only status communication.

---

# 56. Data Model

A possible production model set includes:

```text id="h5gr9u"
TranslateProject
Translation
TranslationRevision
TranslationSegment
TranslationTerminology
TranslationMemoryEntry
TranslationReference
TranslationExport
TranslationJob
TranslationInstruction
```

The final Prisma schema remains authoritative.

No separate hand-written persistence system may compete with Prisma.

---

# 57. Database Integrity

Translate records must include appropriate:

- UUIDs;
- foreign keys;
- ownership relationships;
- indexes;
- unique constraints;
- timestamps;
- deletion behavior.

All user-owned records must have an enforceable account ownership path.

---

# 58. Transactions

Transactions must be used where multiple records must change atomically.

Examples:

- creating a translation and initial revision;
- approving a translation revision;
- updating terminology and associated metadata;
- completing a translation job;
- creating an export record;
- deleting a project.

---

# 59. Deletion

Deleting a Translate project must follow Aila's data lifecycle.

The implementation must account for:

- translation records;
- revisions;
- terminology;
- translation memory;
- reference files;
- vectors;
- exports;
- cached data;
- jobs.

Private data must not remain accessible through stale identifiers.

---

# 60. Performance

Translate should remain responsive for ordinary text translation.

The system should use:

- efficient persistence;
- indexed queries;
- selective context retrieval;
- asynchronous processing for large documents;
- controlled concurrency;
- streaming where useful.

Large documents must not force the browser to hold unnecessary copies of the entire document.

---

# 61. Observability

Translate must provide telemetry for:

- translation latency;
- translation failures;
- language detection failures;
- document extraction failures;
- queue latency;
- job failures;
- export failures;
- rate-limit events;
- entitlement failures.

Logs must minimize sensitive translation content.

Correlation IDs should connect related operations.

---

# 62. Audit Events

Security-sensitive events should be auditable.

Examples:

- translation created;
- translation deleted;
- project deleted;
- reference file uploaded;
- reference file deleted;
- terminology modified;
- export generated;
- unauthorized access attempt.

Audit logs must not become a duplicate store of translation content.

---

# 63. Testing Strategy

## Unit Tests

Test:

- language validation;
- terminology rules;
- translation configuration;
- project ownership;
- revision creation;
- export metadata;
- entitlement checks.

## Integration Tests

Test:

- translation persistence;
- revision persistence;
- AI Gateway requests;
- usage recording;
- file processing;
- document translation jobs;
- export generation.

## End-to-End Tests

Test:

- create translation;
- detect language;
- select target language;
- translate;
- edit result;
- save;
- reopen history;
- upload reference;
- configure terminology;
- translate a supported document;
- export result.

## Security Tests

Test:

- cross-account access;
- unauthorized project access;
- unauthorized file access;
- entitlement bypass;
- prompt injection;
- malformed uploads;
- forged job state;
- unauthorized export;
- sensitive-data leakage.

---

# 64. Acceptance Criteria

Translate V1 is complete only when all applicable criteria pass.

## Translation

- [ ] User can enter source text.
- [ ] User can select a source language.
- [ ] User can select a target language.
- [ ] Automatic language detection works where enabled.
- [ ] User can override detected language.
- [ ] Translation output is editable.
- [ ] Source content remains preserved.
- [ ] Translation persists after reload.
- [ ] Translation history is available.

## Context

- [ ] User can provide context.
- [ ] User can specify tone.
- [ ] User can provide translation instructions.
- [ ] Terminology preferences can be persisted where implemented.
- [ ] Authorized project context can be used.
- [ ] Unauthorized context cannot be retrieved.

## AI

- [ ] Translation uses the Aila AI Gateway.
- [ ] Provider credentials never reach the browser.
- [ ] Entitlements are checked server-side.
- [ ] Usage is recorded.
- [ ] AI failures do not corrupt saved translation content.
- [ ] Prompt injection defenses are active.

## Documents

- [ ] Supported document types can be uploaded.
- [ ] Unsupported documents are rejected safely.
- [ ] Document extraction works for supported formats.
- [ ] Large documents can use controlled jobs.
- [ ] Translation order is preserved.
- [ ] Successful jobs produce validated output.
- [ ] Failed jobs do not corrupt source files.

## Files

- [ ] Uploaded files remain private.
- [ ] Authorization is checked before file retrieval.
- [ ] Deleted projects do not leave accessible files.
- [ ] File processing failures are handled safely.

## Search and History

- [ ] Users can find authorized translations.
- [ ] Search respects account boundaries.
- [ ] Deleted content is not returned through stale indexes.

## Export

- [ ] Authorized users can export translations.
- [ ] Export preserves supported structure.
- [ ] Export failures are recoverable.
- [ ] Exported files remain private.

## Billing

- [ ] Trial state is server-authoritative.
- [ ] Expired trial cannot bypass subscription requirements.
- [ ] Translate entitlement is centrally resolved.
- [ ] Usage limits cannot be bypassed through the frontend.

## Security

- [ ] Cross-account access tests pass.
- [ ] Private files are protected.
- [ ] Secrets are not exposed.
- [ ] Sensitive translation content is not indiscriminately logged.
- [ ] Prompt injection defenses are tested.
- [ ] Unauthorized exports are rejected.

## Reliability

- [ ] AI timeout behavior is tested.
- [ ] Retry behavior is tested.
- [ ] Duplicate jobs are prevented or safely handled.
- [ ] Document translation failures preserve source content.
- [ ] Database transactions protect multi-record operations.

## Accessibility

- [ ] Keyboard navigation works.
- [ ] Language selectors are accessible.
- [ ] Editor controls are accessible.
- [ ] Progress states are accessible.
- [ ] Error states are accessible.

## PWA

- [ ] Translate works inside the Aila PWA.
- [ ] Responsive layouts work on supported viewport sizes.
- [ ] Unsaved work is not silently discarded during application updates.

---

# 65. Production Invariants

The following must always remain true:

1. Every translation belongs to an authorized Aila account.
2. Source content and translation content remain logically distinct.
3. Source content is never silently overwritten by translation output.
4. Translate never directly exposes provider credentials.
5. AI translation requests go through the Aila AI Gateway.
6. Trial eligibility is determined server-side.
7. Subscription eligibility is centrally resolved.
8. Usage is tracked centrally.
9. Translation data is not indiscriminately written to logs.
10. Reference files remain private.
11. Retrieval is authorization-scoped.
12. Translation memory never crosses account boundaries.
13. Unsupported languages are not silently substituted.
14. Document translation preserves ordering.
15. Failed translation jobs do not corrupt source documents.
16. Failed exports do not corrupt source documents.
17. Deleted data does not remain accessible through stale resources.
18. User terminology preferences remain scoped correctly.
19. Arbitrary external code is never executed as part of translation.
20. Production secrets are never committed to the repository.
21. Translate remains part of the single Aila account and entitlement model.
22. No temporary or disposable implementation may become part of production.

---

# 66. Definition of Done

Aila Translate V1 is production-ready only when:

- the documented scope is implemented;
- all critical acceptance criteria pass;
- language selection and detection are verified;
- translation persistence is verified;
- source preservation is verified;
- AI Gateway integration is complete;
- entitlement enforcement is verified;
- usage tracking is verified;
- reference-file security is verified;
- document translation pipelines are validated;
- export pipelines are validated;
- deletion behavior is verified;
- observability is operational;
- backup/recovery requirements are satisfied;
- automated tests pass;
- security tests pass;
- responsive/PWA behavior is verified;
- accessibility requirements are satisfied;
- documentation is current;
- deployment configuration is production-ready;
- no critical or high-severity unresolved release blocker remains.

---

# 67. Final Product Boundary

Aila Translate V1 is a secure, contextual multilingual translation workspace.

Its central promise is:

> **Help users translate meaningful content while preserving context, terminology, structure, and user control.**

Every Translate feature must support that purpose.

Features that cannot satisfy Aila's requirements for authorization, privacy, persistence, AI Gateway integration, usage control, testing, reliability, and production readiness must not enter the Aila V1 production release.