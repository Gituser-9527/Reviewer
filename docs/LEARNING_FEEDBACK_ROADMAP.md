# Learning Feedback Roadmap

V1 is a consented tenant-private quarantine foundation only. It now includes PostgreSQL business-chain constraints, trusted identity, canonical redaction, atomic idempotent submit, CAS human review, append-only lifecycle events, and tenant-scoped internal retention dry-run/explicit cleanup.

It intentionally leaves the Web UI, Extension wiring, automatic retention Scheduler, complete LabelingService persistence, global anonymization, Gold Set promotion, Shadow mode, model training, rule changes, feedback export, and human Pilot unavailable. The internal Retention command is not permission to enable unattended or production deletion.

Any later phase requires a separate threat review, production retention-job authorization, PostgreSQL integration tests, human approval workflow, frozen-evaluation impact analysis, and confirmation that the deterministic YAML Rule Engine remains the source of production conclusions. PR #8 must remain Draft until the planned independent adversarial re-review.
