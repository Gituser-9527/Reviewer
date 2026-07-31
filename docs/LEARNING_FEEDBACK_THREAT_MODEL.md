# Learning Feedback V1 Threat Model

| Threat | V1 control | Residual handling |
| --- | --- | --- |
| Reviewer accidentally submits sensitive text | Browser-safe preview redaction plus authoritative server rescan; strict size and shape limits | Ambiguous identity/address terms become `NEEDS_REVIEW`; reviewers may withdraw |
| Cross-tenant record access | Tenant is resolved from authenticated context, never request body; all reads/writes are tenant-scoped | Authorization failures are generic and do not reveal records |
| Reviewer identity leaks into quality data | Tenant-scoped HMAC pseudonym, key version, no raw reviewer ID in submission payload | Missing key fails closed |
| Feedback silently changes audit outcomes | Feedback is a separate quarantine table with no rule, audit, model, or eval writer | Any future promotion requires a separate approved design |
| Secret or URL leakage in logs | No raw content enters audit logs; only status and digest are logged | Operational errors return stable codes |

V1 has no extension capture, external model call, automatic export, automatic retention deletion, or global anonymized data flow.
