# ADR 0001: Tenant-private Learning Feedback governance

- Status: Accepted for V1 foundation
- Date: 2026-08-03

## Context

Learning Feedback links an authenticated human decision to privacy-quarantined quality data. Independent review identified that separate foreign keys, read-then-write review, mutable records without lifecycle events, and an incomplete retention predicate could not independently protect tenant integrity and governance.

## Decision

V1 remains tenant-private. PostgreSQL composite constraints bind the audit run, review ticket and reviewer decision. Submit is atomic and idempotent. Withdraw and manager review lock the row and let the Repository derive a pseudonymous event from the database-real old state; CHECK constraints and a trigger validate the event chain. Events are application-append-only during the submission lifecycle, not WORM.

Retention has one typed policy and tenant-scoped bounded dry-run inspection. It uses a dedicated database URL and strict parser. Destructive execution is intentionally unavailable: `execute` is rejected and PR #8 has no deletion SQL path. Gold is reported as an anomaly count. There is no automatic recovery, all-tenant mode or Scheduler.

## Consequences

Concurrent review has one winner and a stable conflict loser. Lifecycle evidence cannot contain raw actor identity or feedback payload. Dry-run writes only minimal run/audit counts and never removes submissions or events. Production Retention Execution requires separate database roles, credentials, authorization, target attestation and a runbook. This decision does not authorize production deletion, Gold Set, Shadow mode, training, rule updates, Extension wiring, Ready status, merge, or a human Pilot.
