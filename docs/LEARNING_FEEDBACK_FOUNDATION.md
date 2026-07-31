# Learning Feedback Foundation V1

## Purpose and boundary

This feature provides a tenant-private, privacy-quarantined channel for a human reviewer to voluntarily submit a completed review decision for later quality analysis. It is not training, rule publication, model tuning, automatic evaluation-set promotion, or an audit-decision path. Production YAML rules remain the deterministic conclusion source; Semantic Classifier and Reflection keep their production `UNAVAILABLE` default.

The required sequence is: `AuditRun → HumanReviewTicket → completed reviewer decision → sanitized preview → explicit confirmation → LearningFeedbackSubmission → human quarantine review`. Audit runs cannot bypass the human-decision and consent steps.

## Consent and data minimization

`NONE` is the default. V1 accepts only `TENANT_PRIVATE`; `GLOBAL_ANONYMIZED` is deliberately rejected with `GLOBAL_LEARNING_CONSENT_UNAVAILABLE`. Each stored record includes notice version, consent time, purpose, retention period, digest, redaction summary and a tenant-scoped HMAC pseudonym. It never stores a raw reviewer identity, token, Authorization value, cookie, database URL, full HTML, screenshot, full job text, full URL, or raw capture.

The browser-safe preview redacts deterministically first. The API repeats redaction authoritatively, applies existing server-side sensitive-data redaction, enforces field limits, and routes ambiguous name/address/organization wording to `NEEDS_REVIEW`. Missing pseudonym-key configuration fails closed.

## Quarantine lifecycle

Allowed statuses are `RECEIVED`, `NEEDS_REVIEW`, `PRIVACY_REJECTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, and reserved `PROMOTED_TO_GOLD_SET`. No status is automatically approved or promoted. The promotion endpoint explicitly returns `GOLD_SET_PROMOTION_UNAVAILABLE`.

Retention cleanup must be an independently authorized, audited maintenance task; it is not an automatic runtime side effect in V1. Withdrawal marks the quarantined record withdrawn and prevents any future review use.

## Access control

The API uses dedicated `learning-feedback:write`, `learning-feedback:read`, and `learning-feedback:review` permissions. The request body cannot select a tenant or reviewer identity. A reviewer can submit only their own completed review in their tenant; tenant boundaries are checked before every read or write. `AUDIT_OPERATOR` receives no new permission.

## Explicit non-goals

- No automatic model training, YAML-rule update, severity change, conclusion change, gold-set promotion, or global improvement.
- No extension collection, Manifest modification, external model call, or telemetry expansion.
- No change to production authentication, CORS policy, tenant-isolation semantics, or the manual ASSIST extension boundary.
