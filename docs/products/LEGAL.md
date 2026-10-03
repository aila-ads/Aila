# Aila Legal — V1 Product Specification

**Product:** Aila Legal  
**Release:** Aila V1.0  
**Status:** Production Specification  
**Parent Product:** Aila  
**Canonical Repository:** `/home/aila/Projects/Aila`

---

# 1. Purpose

Aila Legal is Aila's legal-focused document analysis and information workspace.

It helps users understand and work with legal materials by providing structured assistance for:

- document analysis;
- clause identification;
- summaries;
- definitions;
- issue spotting;
- comparisons;
- structured legal analysis;
- document questions;
- reports;
- source references where available.

Aila Legal is an assistive information and analysis product.

It is not a substitute for qualified legal counsel and must not represent AI-generated output as legal advice, legal representation, legal certification, or a guaranteed legal conclusion.

---

# 2. Product Role

Aila Legal operates under the user's existing Aila account.

It shares:

- authentication;
- account ownership;
- trial;
- subscription;
- centralized entitlements;
- AI Gateway;
- file storage;
- usage tracking;
- projects;
- notifications;
- security;
- observability;
- audit infrastructure.

Legal must not create an independent identity, subscription, or entitlement system.

---

# 3. V1 Scope

Aila Legal V1 includes:

- legal projects;
- legal conversations;
- legal document uploads;
- document analysis;
- document summaries;
- clause identification;
- clause explanations;
- definitions;
- issue spotting;
- document comparison;
- structured questions;
- legal research assistance using authorized sources where available;
- source attribution;
- citations/references where available;
- jurisdiction/context capture;
- uncertainty indicators;
- structured reports;
- document history;
- project context;
- reference files;
- export;
- usage tracking;
- entitlement enforcement;
- privacy protections;
- security controls;
- auditability;
- responsive UI;
- PWA support;
- accessibility;
- automated testing;
- operational monitoring.

---

# 4. V1 Non-Goals

Aila Legal V1 does not provide:

- attorney-client representation;
- attorney-client privilege;
- a lawyer-client relationship;
- guaranteed legal advice;
- guaranteed legal conclusions;
- court representation;
- filing documents with courts;
- signing legal documents on behalf of users;
- guaranteed jurisdiction-specific legal compliance;
- legal certification;
- notarization;
- autonomous legal decisions;
- autonomous acceptance or rejection of contracts;
- automatic execution of legal agreements;
- unrestricted external legal research without source controls;
- fabricated case law;
- fabricated statutes;
- fabricated citations;
- guaranteed completeness of legal research.

---

# 5. Primary User Outcomes

A successful Legal user can:

1. Create a legal project.
2. Identify the relevant jurisdiction and context.
3. Upload supported legal documents.
4. Ask questions about authorized material.
5. Generate a structured summary.
6. Identify relevant clauses.
7. Understand defined terms.
8. Identify potential issues for further review.
9. Compare authorized documents.
10. Review supporting source material where available.
11. Understand uncertainty and limitations.
12. Generate a structured report.
13. Export authorized results.

---

# 6. Legal Workspace

The workspace should provide:

```text id="7zqgqf"
Legal
├── Legal Home
├── Projects
├── Documents
├── Conversations
├── Document Analysis
├── Clauses
├── Definitions
├── Issues
├── Comparisons
├── Research
├── Sources
├── Reports
├── History
└── Export
```

The exact visual structure may evolve without changing these functional boundaries.

---

# 7. Legal Project

A Legal project represents a defined legal-information task or collection of related documents.

Examples include:

- contract review;
- employment document review;
- policy analysis;
- lease review;
- corporate document review;
- legal research;
- document comparison.

A project may contain:

- documents;
- conversations;
- analysis;
- issues;
- clauses;
- definitions;
- sources;
- reports;
- instructions;
- jurisdiction metadata.

---

# 8. Project Metadata

A Legal project may contain:

- project ID;
- account ID;
- owner/user ID;
- title;
- description;
- jurisdiction;
- legal context;
- document type;
- matter type;
- user instructions;
- status;
- timestamps.

Jurisdiction must be treated as contextual information.

The presence of a selected jurisdiction must not imply that Aila has provided jurisdictionally definitive legal advice.

---

# 9. Jurisdiction

The user should be able to specify relevant jurisdictional context.

Examples may include:

- country;
- state/province;
- territory;
- court system;
- regulatory context.

Where jurisdiction is unknown or ambiguous, Aila should identify that limitation rather than silently assuming one.

---

# 10. Legal Context

Users may provide additional context such as:

- parties;
- transaction type;
- purpose;
- relevant dates;
- intended use;
- specific questions;
- concerns.

The AI must distinguish user-provided facts from AI-generated interpretation.

---

# 11. Document Uploads

Users may upload supported legal documents.

Examples may include:

- PDF;
- DOCX;
- supported text documents;
- other formats explicitly supported by the production file pipeline.

The supported format list must be controlled by production configuration.

---

# 12. Document Security

Legal documents may contain highly sensitive information.

The file pipeline must provide:

- secure upload;
- file validation;
- malware/security scanning where required;
- private storage;
- authorization checks;
- controlled extraction;
- deletion lifecycle;
- auditability.

A document belonging to one account must never be retrievable by another account.

---

# 13. Document Processing

The processing pipeline should be:

```text id="m7v9sl"
Upload
 ↓
Authentication
 ↓
Authorization
 ↓
Validation
 ↓
Secure Storage
 ↓
Security Scanning
 ↓
Text / Structure Extraction
 ↓
Normalization
 ↓
Indexing
 ↓
Ready for Analysis
```

Each stage should have an explicit status.

---

# 14. Document Integrity

The original uploaded document must be preserved as the authoritative source file.

AI processing must not modify the original.

Derived artifacts such as:

- extracted text;
- summaries;
- clause records;
- embeddings;
- analysis results

must remain linked to the original source.

---

# 15. Legal Conversations

Users should be able to ask questions about authorized documents.

Conversation context may include:

- current document;
- selected passage;
- project documents;
- user instructions;
- jurisdiction;
- previous conversation messages.

Only authorized documents may enter the AI context.

---

# 16. Conversation Roles

Legal conversations should use explicit message roles such as:

```text id="5f2t5u"
USER
ASSISTANT
SYSTEM / APPLICATION
TOOL / SOURCE
```

Tool/source results must remain distinguishable from AI-generated interpretation.

---

# 17. Document Questions

Users may ask questions such as:

- What does this clause mean?
- What are the termination provisions?
- What obligations does this section create?
- What deadlines are mentioned?
- What definitions are used?
- Which sections address confidentiality?
- What issues should I ask a lawyer about?

The system must answer using authorized context and clearly identify uncertainty where appropriate.

---

# 18. Summaries

Legal summaries should provide structured information such as:

- document purpose;
- parties;
- important dates;
- obligations;
- rights;
- termination;
- payment;
- confidentiality;
- liability;
- dispute resolution;
- governing law;
- notable clauses.

The exact summary structure should adapt to document type.

Summaries are informational and must not be presented as a complete legal review unless the system can substantiate that claim.

---

# 19. Clause Identification

The system may identify clauses such as:

- confidentiality;
- termination;
- indemnity;
- limitation of liability;
- governing law;
- dispute resolution;
- payment;
- intellectual property;
- warranties;
- representations;
- non-compete/non-solicitation;
- data protection;
- renewal;
- assignment.

The taxonomy must remain configurable.

The system must not assume that every document contains every clause.

---

# 20. Clause Explanation

For identified clauses, Aila may provide:

- plain-language explanation;
- relevant section;
- practical interpretation;
- potential questions;
- related clauses.

Interpretation must remain appropriately qualified.

Aila must not convert uncertain interpretation into a definitive legal conclusion.

---

# 21. Definitions

Legal documents often contain defined terms.

Legal should identify:

- defined term;
- definition;
- location;
- references;
- usage.

The system should preserve the document's original definition separately from any AI explanation.

---

# 22. Issue Spotting

Aila Legal may identify potential issues such as:

- ambiguous wording;
- missing information;
- unusual provisions;
- conflicting clauses;
- broad obligations;
- potentially significant deadlines;
- inconsistent definitions;
- unclear responsibilities.

Issues must be labeled as potential issues.

The system must not represent issue spotting as a definitive legal finding.

---

# 23. Risk Language

The product should avoid unsupported categorical statements such as:

> This contract is illegal.

Instead, appropriate output should identify:

- what was observed;
- why it may matter;
- what information is missing;
- what should be reviewed;
- when professional legal advice may be appropriate.

---

# 24. Document Comparison

Users may compare two or more authorized documents.

Comparison may identify:

- added clauses;
- removed clauses;
- changed language;
- changed definitions;
- changed obligations;
- changed dates;
- changed monetary terms;
- structural differences.

The original documents must remain preserved.

---

# 25. Comparison Integrity

Comparison results must clearly distinguish:

```text id="k3ip6n"
Source Document A
Source Document B
Observed Difference
AI Interpretation
```

The system must not present an inferred legal consequence as if it were directly contained in the source documents.

---

# 26. Legal Research Assistance

Where Aila provides external research capability, Legal may help users:

- formulate research questions;
- identify relevant sources;
- summarize retrieved material;
- compare sources;
- organize research notes.

Research results must preserve source attribution.

---

# 27. Source Attribution

Legal must prioritize source traceability.

Where a claim comes from a document or external source, the interface should identify the source where technically possible.

Sources should include appropriate metadata such as:

- title;
- source;
- location;
- retrieval date where applicable;
- relevant section/page;
- citation information where available.

---

# 28. No Fabricated Citations

Aila Legal must never knowingly fabricate:

- cases;
- statutes;
- regulations;
- legal provisions;
- court decisions;
- citations;
- quotations;
- source URLs.

If a source cannot be verified, the system must say so.

---

# 29. Source Confidence

Where source quality is uncertain, the system should distinguish:

- verified source;
- user-provided source;
- retrieved source;
- model-generated explanation;
- unverified information.

The UI should not blur these categories.

---

# 30. Uncertainty

Legal analysis must explicitly communicate uncertainty where relevant.

Uncertainty may arise from:

- missing jurisdiction;
- incomplete documents;
- ambiguous language;
- unavailable sources;
- conflicting authorities;
- incomplete facts;
- changing law;
- model limitations.

The system should identify what additional information could change the analysis.

---

# 31. Legal Disclaimer

The product must communicate an appropriate limitation such as:

- Aila Legal provides informational and analytical assistance;
- it does not replace qualified legal counsel;
- users should seek professional legal advice for decisions requiring legal judgment.

The disclaimer must not be used as a substitute for proper system behavior.

The product must still minimize misleading or overconfident output.

---

# 32. AI Gateway

All Legal AI operations must use the Aila AI Gateway.

Legal must never directly call an external AI provider.

Required flow:

```text id="q18tzw"
Legal UI
 ↓
Legal Service
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
Legal Policy
 ↓
Context Assembly
 ↓
Retrieval
 ↓
Model Routing
 ↓
Provider Adapter
 ↓
AI Provider
```

---

# 33. Legal AI Policy

Legal requests require a product-specific AI policy layer.

The policy should enforce:

- source grounding where appropriate;
- uncertainty;
- citation requirements where available;
- jurisdiction awareness;
- privacy protections;
- refusal or redirection for unsupported high-risk actions;
- clear distinction between source facts and AI interpretation.

---

# 34. Context Assembly

Legal AI context may include:

1. system rules;
2. Aila Legal policy;
3. user request;
4. jurisdiction;
5. selected document;
6. relevant document passages;
7. authorized project documents;
8. verified sources;
9. prior conversation context.

Context must be authorization-scoped.

---

# 35. Retrieval

Legal may use Aila's vector infrastructure for document retrieval.

Retrieval must be scoped by:

```text id="x1p6qi"
account_id
project_id
document authorization
```

No unauthorized document or vector may enter a Legal AI context.

---

# 36. Prompt Injection Protection

Legal documents are untrusted data.

A document may contain malicious instructions designed to influence an AI model.

Such instructions must not override:

- system instructions;
- Legal policies;
- authorization;
- source handling;
- privacy controls.

Retrieved text must remain data.

---

# 37. Sensitive Information

Legal documents may contain:

- names;
- addresses;
- financial information;
- employment information;
- business secrets;
- identification information;
- contractual information.

The system must minimize unnecessary exposure.

AI requests must include only the context necessary for the requested task.

---

# 38. Logging Restrictions

Legal document content must not be indiscriminately written to:

- application logs;
- error logs;
- analytics;
- performance telemetry.

Operational logs should contain metadata sufficient for diagnosis without unnecessarily reproducing confidential legal content.

---

# 39. Entitlements

Legal uses the centralized entitlement system.

Example:

```text id="b7i6up"
legal
```

Shared entitlements may include:

```text id="h2u8k0"
file_upload
projects
advanced_models
```

Legal must not implement its own subscription logic.

---

# 40. Trial and Subscription

The Aila 3-hour trial applies to Legal.

The server determines:

- trial state;
- expiration;
- subscription status;
- entitlement;
- usage eligibility.

After trial expiration, continued Pro usage requires an eligible Aila Pro subscription.

The browser must never be authoritative for access decisions.

---

# 41. Usage Tracking

Legal AI operations should record:

- account;
- user;
- product;
- operation;
- model;
- provider;
- request ID;
- token usage where available;
- latency;
- estimated cost;
- status;
- timestamps.

The system must avoid recording full legal documents or sensitive prompt content in ordinary usage telemetry.

---

# 42. Usage Limits

Legal must respect centralized limits.

Limits may consider:

- account;
- user;
- document size;
- concurrent analyses;
- model capability;
- file volume;
- subscription entitlement.

Limit enforcement must occur server-side.

---

# 43. Reports

Legal may generate structured reports containing:

- document overview;
- relevant clauses;
- definitions;
- issues;
- questions;
- source references;
- uncertainty;
- recommended areas for professional review.

Reports must distinguish source observations from AI interpretation.

---

# 44. Report Generation

Report generation may be asynchronous for large documents.

Recommended states:

```text id="gk9w6m"
QUEUED
PROCESSING
COMPLETED
FAILED
CANCELED
```

The system must not mark a report complete before required processing succeeds.

---

# 45. Export

Legal should support export of authorized reports and analysis.

Supported formats must be limited to production-validated formats.

Exports must preserve, where applicable:

- document title;
- analysis sections;
- citations;
- source references;
- issue labels;
- uncertainty notes.

---

# 46. Export Privacy

Exported Legal reports may contain sensitive information.

Generated files must:

- remain private;
- require authorization;
- follow retention rules;
- be deletable;
- not be indexed publicly.

---

# 47. Errors

Legal must provide clear errors for:

- failed document extraction;
- unsupported document;
- failed retrieval;
- AI timeout;
- AI failure;
- source unavailable;
- entitlement failure;
- rate limit;
- export failure.

Errors must not expose:

- secrets;
- internal stack traces;
- database details;
- provider credentials;
- private document contents.

---

# 48. Streaming

Legal conversations may use streaming.

Streaming must:

- authenticate;
- authorize;
- validate entitlement;
- enforce rate limits;
- track usage;
- support cancellation where practical;
- handle partial output safely.

Partial output must not be presented as a completed legal analysis.

---

# 49. Long-Running Analysis

Large document analysis should use controlled background jobs.

Jobs must:

- have explicit states;
- be authorization-scoped;
- support safe retries;
- prevent duplicate uncontrolled execution;
- record operational status;
- preserve source documents.

---

# 50. Notifications

Legal may notify users when:

- document analysis completes;
- report generation completes;
- export completes;
- processing fails.

Notifications must remain private to the relevant account/user.

---

# 51. Responsive and PWA Requirements

Legal must work on:

- desktop;
- laptop;
- tablet;
- supported mobile browsers.

The interface must make long documents and analysis results readable on small screens.

The product must function correctly inside the Aila PWA.

---

# 52. Accessibility

Legal must support:

- keyboard navigation;
- visible focus;
- semantic headings;
- accessible dialogs;
- accessible upload controls;
- accessible progress states;
- accessible errors;
- screen-reader-compatible controls;
- sufficient contrast.

Source citations and references must be accessible.

---

# 53. Data Model

A possible production model set includes:

```text id="2lcvri"
LegalProject
LegalDocument
LegalDocumentVersion
LegalConversation
LegalMessage
LegalClause
LegalDefinition
LegalIssue
LegalComparison
LegalSource
LegalCitation
LegalAnalysis
LegalReport
LegalReference
LegalJob
LegalExport
```

The final Prisma schema remains authoritative.

---

# 54. Database Integrity

Legal records must include:

- UUIDs;
- account ownership;
- project relationships;
- document relationships;
- foreign keys;
- indexes;
- unique constraints;
- timestamps;
- deletion behavior.

Every Legal resource containing user data must have an enforceable ownership path.

---

# 55. Transactions

Transactions must protect operations requiring atomic updates.

Examples:

- document creation;
- analysis creation;
- report creation;
- comparison creation;
- source association;
- job completion;
- project deletion.

---

# 56. Deletion

Deletion must follow Aila's documented data lifecycle.

Deleting a Legal project must account for:

- documents;
- extracted text;
- conversations;
- messages;
- clauses;
- issues;
- sources;
- reports;
- exports;
- vectors;
- queued jobs;
- cached data.

Deleted private content must not remain accessible through stale resources.

---

# 57. Data Retention

Legal data must follow explicit retention rules.

The system must not retain confidential legal material indefinitely merely because it is technically convenient.

Retention must be documented and enforceable.

---

# 58. Auditability

Legal requires stronger auditability because users may rely on analysis for consequential decisions.

Audit events should include:

- document upload;
- document deletion;
- analysis creation;
- report generation;
- source addition;
- export;
- sensitive access attempts;
- authorization failures.

Audit logs must contain metadata rather than unnecessary copies of legal content.

---

# 59. Observability

Legal telemetry should include:

- document-processing latency;
- extraction failures;
- AI request latency;
- AI failures;
- retrieval failures;
- report-generation duration;
- export failures;
- job queue failures;
- entitlement failures.

Telemetry must avoid unnecessary sensitive content.

---

# 60. Security Testing

Security testing must specifically include:

- cross-account document access;
- cross-project access;
- unauthorized conversation access;
- unauthorized report access;
- unauthorized export;
- vector isolation;
- prompt injection;
- malicious documents;
- malformed uploads;
- secret leakage;
- logging leakage;
- entitlement bypass.

---

# 61. Testing Strategy

## Unit Tests

Test:

- jurisdiction validation;
- document ownership;
- clause models;
- issue models;
- source attribution;
- report structure;
- entitlement checks;
- uncertainty metadata.

## Integration Tests

Test:

- document upload;
- extraction;
- persistence;
- AI Gateway;
- retrieval;
- analysis;
- report generation;
- export;
- usage recording.

## End-to-End Tests

Test:

- create Legal project;
- upload document;
- analyze document;
- ask a question;
- identify clauses;
- review definitions;
- identify potential issues;
- compare documents;
- generate report;
- export report;
- reopen project.

---

# 62. Acceptance Criteria

## Projects

- [ ] User can create a Legal project.
- [ ] Project belongs to the correct account.
- [ ] Unauthorized users cannot access it.
- [ ] Jurisdiction/context can be stored.
- [ ] Project persists across sessions.

## Documents

- [ ] Supported legal documents can be uploaded.
- [ ] Unsupported files are rejected safely.
- [ ] Original documents remain preserved.
- [ ] Extraction status is visible.
- [ ] Failed extraction does not corrupt the source file.
- [ ] Unauthorized users cannot retrieve documents.

## Analysis

- [ ] User can ask questions about authorized documents.
- [ ] Summaries can be generated.
- [ ] Clauses can be identified.
- [ ] Definitions can be identified.
- [ ] Potential issues can be identified.
- [ ] AI interpretations are distinguishable from source facts.
- [ ] Uncertainty is communicated where applicable.

## Comparisons

- [ ] Authorized documents can be compared.
- [ ] Differences are traceable to source documents.
- [ ] AI interpretation is distinguished from observed differences.

## Research

- [ ] Research sources are attributed where available.
- [ ] Citations are preserved.
- [ ] Fabricated citations are not produced.
- [ ] Unverified sources are identified appropriately.

## AI

- [ ] Legal AI requests use the Aila AI Gateway.
- [ ] Provider credentials never reach the browser.
- [ ] Legal-specific AI policy is enforced.
- [ ] Entitlements are checked server-side.
- [ ] Usage is recorded.
- [ ] Prompt injection defenses are active.

## Privacy

- [ ] Private legal documents remain private.
- [ ] Sensitive document content is not indiscriminately logged.
- [ ] Retrieval is account/project scoped.
- [ ] Deleted resources are no longer accessible.

## Reports

- [ ] Reports can be generated from authorized data.
- [ ] Reports distinguish source observations from AI interpretation.
- [ ] Uncertainty/limitations are represented.
- [ ] Reports can be exported where supported.

## Billing

- [ ] Trial state is server-authoritative.
- [ ] Trial expiration cannot be bypassed.
- [ ] Legal entitlement is centrally resolved.
- [ ] Usage limits cannot be bypassed through the frontend.

## Reliability

- [ ] Large analysis can use background jobs.
- [ ] Job states are reliable.
- [ ] Retry behavior is safe.
- [ ] Duplicate processing is prevented or safely handled.
- [ ] Source documents remain intact during failures.

## Accessibility

- [ ] Keyboard navigation works.
- [ ] Document upload controls are accessible.
- [ ] Analysis results are accessible.
- [ ] Citations/references are accessible.
- [ ] Errors are understandable.

## PWA

- [ ] Legal works inside the Aila PWA.
- [ ] Responsive layouts work on supported viewport sizes.
- [ ] Application updates do not silently discard user work.

---

# 63. Production Invariants

The following must always remain true:

1. Every Legal project belongs to an authorized Aila account.
2. Legal documents are private by default.
3. Legal never trusts the browser for authorization.
4. Legal never exposes AI provider credentials.
5. All Legal AI operations use the Aila AI Gateway.
6. Trial state is server-authoritative.
7. Subscription state is centrally resolved.
8. Usage is centrally tracked.
9. Legal documents are not indiscriminately copied into logs.
10. Retrieved documents and vectors are authorization-scoped.
11. Uploaded documents are preserved separately from derived AI output.
12. Source facts remain distinguishable from AI interpretation.
13. Uncertainty is communicated where relevant.
14. Citations are not fabricated.
15. The system does not claim to provide attorney representation or guaranteed legal advice.
16. The system does not silently assume jurisdiction where it materially matters.
17. Failed analysis does not corrupt source documents.
18. Failed exports do not corrupt source documents.
19. Deleted private data does not remain accessible through stale resources.
20. Production secrets never enter source control.
21. Legal remains part of the single Aila account and entitlement model.
22. No temporary or disposable implementation may become part of production.

---

# 64. Definition of Done

Aila Legal V1 is production-ready only when:

- the documented Legal scope is implemented;
- document upload and secure processing are operational;
- authorization tests pass;
- account isolation tests pass;
- AI Gateway integration is complete;
- Legal-specific AI controls are verified;
- source attribution behavior is verified;
- fabricated citation protections are tested;
- uncertainty handling is verified;
- entitlement enforcement is verified;
- usage tracking is verified;
- deletion behavior is verified;
- export security is verified;
- observability is operational;
- backup/recovery requirements are satisfied;
- automated tests pass;
- security testing passes;
- responsive/PWA behavior is verified;
- accessibility requirements are satisfied;
- documentation is current;
- deployment configuration is production-ready;
- no critical or high-severity unresolved release blocker remains.

---

# 65. Final Product Boundary

Aila Legal V1 is a secure legal-information and document-analysis workspace.

Its central promise is:

> **Help users understand and organize legal information from authorized documents and sources while clearly separating source material, AI interpretation, uncertainty, and the need for professional legal review.**

Every Legal feature must support that purpose.

Features that cannot satisfy Aila's requirements for privacy, source integrity, authorization, auditability, uncertainty handling, AI Gateway integration, testing, reliability, and production readiness must not enter the Aila V1 production release.