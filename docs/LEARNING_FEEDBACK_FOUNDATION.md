# Learning Feedback Foundation V1

## Purpose and boundary

This feature provides a tenant-private, privacy-quarantined channel for a human reviewer to voluntarily submit a completed review decision for later quality analysis. It is not training, rule publication, model tuning, automatic evaluation-set promotion, or an audit-decision path. Production YAML rules remain the deterministic conclusion source; Semantic Classifier and Reflection keep their production `UNAVAILABLE` default.

The required sequence is: `AuditRun → HumanReviewTicket → completed reviewer decision → sanitized preview → explicit confirmation → LearningFeedbackSubmission → human quarantine review`. Audit runs cannot bypass the human-decision and consent steps. The submission references the completed `human_review_feedback` record by its UUID primary key; it does not reference the separate multi-reviewer labeling/aggregation records.

## Consent and data minimization

`NONE` is the default. V1 accepts only `TENANT_PRIVATE`; `GLOBAL_ANONYMIZED` is deliberately rejected with `GLOBAL_LEARNING_CONSENT_UNAVAILABLE`. The authenticated API adapter fixes `source=API`, `purpose=QUALITY_IMPROVEMENT_REVIEW`, and `consentNoticeVersion=learning-feedback-v1`; clients cannot supply those values. Each stored record includes notice version, consent time, purpose, retention period, digest, redaction summary and a tenant-scoped HMAC pseudonym. It never stores a raw reviewer identity, token, Authorization value, cookie, database URL, full HTML, screenshot, full job text, full URL, or raw capture.

The API preview and submit paths use the same canonical `packages/core/src/security/` sanitizer, enforce field limits, and route ambiguous name/address/organization wording to `NEEDS_REVIEW`. Missing pseudonym-key or server notice configuration fails closed. No browser or extension learning-feedback adapter is implemented in V1.

## Quarantine lifecycle and governance

Allowed statuses are `RECEIVED`, `NEEDS_REVIEW`, `PRIVACY_REJECTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, and reserved `PROMOTED_TO_GOLD_SET`. No status is automatically approved or promoted. The promotion endpoint explicitly returns `GOLD_SET_PROMOTION_UNAVAILABLE`.

Withdrawal and review lock the tenant-scoped submission row. Only `RECEIVED/NEEDS_REVIEW` may be withdrawn by the original reviewer or approved/rejected by a manager. The Repository derives the event from the database's real old state and constructs it internally; a PostgreSQL trigger validates the lifecycle chain. Competing or repeated reviews return a conflict.

During a submission's lifecycle, the application Repository only appends `SUBMITTED`, `WITHDRAWN`, `REVIEW_APPROVED`, or `REVIEW_REJECTED`; it does not update old events. This is not a WORM or legal immutability guarantee: database maintenance roles are outside the application contract, and authorized Retention deletes events with their parent. Actors are tenant-scoped HMAC pseudonyms; reason notes and bounded correlation IDs use canonical security handling.

Retention uses only a dedicated maintenance database URL and maintenance role, not the ordinary application repository. Execute requires tenant, bounded batch, environment guard and a confirmation target bound to the verified database name and non-secret endpoint identity, tenant, cutoff, batch and environment; production execute is unavailable. A governance version/database-time fence linearizes Review/Withdraw against cleanup. Any Gold state blocks the tenant execute, deletes zero rows and persists a minimal `ANOMALY` run/Audit Log; other classified execute failures persist a minimal `FAILED` run/Audit when that audit transaction is available, otherwise return a failure-audit-unavailable error. One command processes one batch. No Scheduler exists.

## Implemented foundation versus remaining work

Implemented: authenticated API foundation, PostgreSQL persistence and composite business-chain constraints, trusted reviewer identity, canonical server redaction, atomic idempotency, human quarantine, lock-linearized review/withdraw with internally constructed lifecycle events, and test/development internal retention dry-run/guarded cleanup.

Not implemented: Web administration UI, Extension learning-feedback wiring, automatic retention Scheduler, complete LabelingService persistence, Gold Set, Shadow mode, training, automatic rule changes, or a human Pilot. This is not a complete learning platform.

## Access control

The API uses dedicated `learning-feedback:write`, `learning-feedback:read`, and `learning-feedback:review` permissions. The request body cannot select a tenant or reviewer identity. A reviewer can submit only their own completed review in their tenant; tenant boundaries are checked before every read or write. `AUDIT_OPERATOR` receives no new permission.

## Explicit non-goals

- No automatic model training, YAML-rule update, severity change, conclusion change, gold-set promotion, or global improvement.
- No extension collection, Manifest modification, external model call, or telemetry expansion.
- No change to production authentication, CORS policy, tenant-isolation semantics, or the manual ASSIST extension boundary.
