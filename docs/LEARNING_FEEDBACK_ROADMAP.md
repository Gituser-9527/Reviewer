# Learning Feedback Roadmap

V1 is a consented tenant-private quarantine foundation only. It includes PostgreSQL business-chain constraints, trusted identity, canonical redaction, atomic idempotent submit, lock-linearized human governance, lifecycle events that are application-append-only, and tenant-scoped Retention policy inspection/dry-run.

It intentionally leaves the Web UI, Extension wiring, Production Retention Execution, automatic retention Scheduler, complete LabelingService persistence, global anonymization, Gold Set promotion, Shadow mode, model training, rule changes, feedback export, and human Pilot unavailable. The internal Retention command is inspection only and not permission to enable deletion.

Production Retention Execution requires a separate threat review, dedicated DB maintenance role, least-privilege grants, separate credentials, deployment provisioning, authenticated authorization, target attestation, audit, runbook and PostgreSQL integration tests. PR #8 must remain Draft until final targeted review.
