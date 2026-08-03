# Learning Feedback V1 Threat Model

| Threat | V1 control | Residual handling |
| --- | --- | --- |
| Reviewer accidentally submits sensitive text | Preview and submit share the canonical server sanitizer; strict size and shape limits | Ambiguous identity/address terms become `NEEDS_REVIEW`; the original decision owner may withdraw unreviewed records |
| Cross-tenant record access | Tenant is resolved from authenticated context, never request body; all reads/writes are tenant-scoped | Authorization failures are generic and do not reveal records |
| Reviewer identity leaks into quality data | Tenant-scoped HMAC pseudonym, key version, no raw reviewer ID in submission payload | Missing key fails closed |
| Feedback silently changes audit outcomes | Feedback is a separate quarantine table with no rule, audit, model, or eval writer | Any future promotion requires a separate approved design |
| Secret or URL leakage in logs | No raw content or digest enters audit logs; database errors use a metadata allowlist | Operational errors return stable codes without SQL parameters or payloads |
| Concurrent managers overwrite review outcomes | Tenant-scoped conditional update; state and one terminal event commit in one transaction | Losing and repeated requests receive a stable `409` conflict |
| Lifecycle event tampering or orphaning | Insert-only repository contract, partial unique indexes, composite tenant FK, transaction coupling | Retention deletes events with their submission; general audit retains only a minimal operation summary |
| Sensitive review reason leaks | Controlled reason-code/status matrix, bounded note and canonical security sanitizer | Free text is optional and never copied into generic audit metadata |
| Dry-run and execute select different records | One shared typed policy and one SQL predicate shape | PostgreSQL state-matrix regression is required for release |
| Cross-tenant or unbounded cleanup | Explicit tenant, bounded batch, transactional predicate recheck and `SKIP LOCKED` | No all-tenant mode or public HTTP route exists |
| Reserved Gold record is deleted | V1 execute fails closed if any tenant-scoped Gold anomaly exists | Human investigation is required; promotion remains unreachable |
| Cleanup logs expose feedback | Retention run and general audit contain counts/statuses only | Candidate IDs may appear only in command response, never in persisted summaries |
| Automatic deletion is enabled accidentally | No Scheduler; execute requires command mode, tenant, confirm and environment guard | Production authorization and operating procedure remain separate future gates |

V1 has no extension capture, external model call, automatic export, automatic retention Scheduler, or global anonymized data flow. Explicit cleanup is an internal maintenance capability and is verified only against the dedicated test PostgreSQL environment in this change.
