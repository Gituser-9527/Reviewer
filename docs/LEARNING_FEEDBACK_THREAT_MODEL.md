# Learning Feedback V1 Threat Model

| Threat | V1 control | Residual handling |
| --- | --- | --- |
| Reviewer accidentally submits sensitive text | Preview and submit share the canonical server sanitizer; strict size and shape limits | Ambiguous identity/address terms become `NEEDS_REVIEW`; the original decision owner may withdraw unreviewed records |
| Cross-tenant record access | Tenant is resolved from authenticated context, never request body; all reads/writes are tenant-scoped | Authorization failures are generic and do not reveal records |
| Reviewer identity leaks into quality data | Tenant-scoped HMAC pseudonym, key version, no raw reviewer ID in submission payload | Missing key fails closed |
| Feedback silently changes audit outcomes | Feedback is a separate quarantine table with no rule, audit, model, or eval writer | Any future promotion requires a separate approved design |
| Secret or URL leakage in logs | No raw content or digest enters audit logs; database errors use a metadata allowlist | Operational errors return stable codes without SQL parameters or payloads |
| Concurrent managers overwrite review outcomes | Row lock, database-real old state and internally constructed event commit in one transaction | Losing and repeated requests receive a stable `409` conflict |
| Lifecycle event is mismatched or tampered with | Repository does not accept complete events; CHECK/trigger validate current state, previous event and reason matrix | Application append-only is not WORM; maintenance roles are outside the contract and Retention deletes events with the submission |
| Sensitive review reason leaks | Controlled reason-code/status matrix, bounded note and canonical security sanitizer | Free text is optional and never copied into generic audit metadata |
| Dry-run and execute select different records | One shared typed policy and one SQL predicate shape | PostgreSQL state-matrix regression is required for release |
| Cross-tenant, wrong-target or unbounded cleanup | Dedicated URL, strict CLI, target-bound confirmation, explicit tenant, bounded batch and `SKIP LOCKED` | Production execute and all-tenant/public routes remain unavailable |
| Review/Withdraw races cleanup | Database operation-start fence plus governance-version snapshot and row locks | Winner is linearized; the same record cannot be both transitioned and counted deleted in one overlap |
| Reserved Gold record is deleted | Any tenant-scoped Gold blocks execute; deletion remains zero while an ANOMALY run/audit is persisted | Manual production recovery runbook remains unavailable; no automatic Gold mutation |
| Cleanup logs expose feedback | Retention run and general audit contain counts/statuses only | Candidate IDs may appear only in command response, never in persisted summaries |
| Automatic deletion is enabled accidentally | No Scheduler; execute requires dedicated URL, strict target-bound confirmation and test/development environment | Production execute, authorization and operating procedure remain unavailable |

V1 has no extension capture, external model call, automatic export, automatic retention Scheduler, or global anonymized data flow. Explicit cleanup is an internal maintenance capability and is verified only against the dedicated test PostgreSQL environment in this change.
