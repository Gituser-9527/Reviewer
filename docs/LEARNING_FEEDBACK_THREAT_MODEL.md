# Learning Feedback V1 Threat Model

| Threat | V1 control | Residual handling |
| --- | --- | --- |
| Reviewer accidentally submits sensitive text | Preview and submit share the canonical server sanitizer; strict size and shape limits | Ambiguous identity/address terms become `NEEDS_REVIEW`; the original decision owner may withdraw unreviewed records |
| Cross-tenant record access | Tenant is resolved from authenticated context, never request body; all reads/writes are tenant-scoped | Authorization failures are generic and do not reveal records |
| Reviewer identity leaks into quality data | Tenant-scoped HMAC pseudonym, key version, no raw reviewer ID in submission payload | Missing key fails closed |
| Feedback silently changes audit outcomes | Feedback is a separate quarantine table with no rule, audit, model, or eval writer | Any future promotion requires a separate approved design |
| Secret or URL leakage in logs | No raw content or digest enters audit logs; database errors use a metadata allowlist | Operational errors return stable codes without SQL parameters or payloads |

V1 has no extension capture, external model call, automatic export, automatic retention deletion, or global anonymized data flow.
