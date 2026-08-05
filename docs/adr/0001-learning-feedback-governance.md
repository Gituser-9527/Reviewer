# ADR 0001: Tenant-private Learning Feedback governance

- Status: Accepted for V1 foundation
- Date: 2026-08-03

## Context

Learning Feedback links an authenticated human decision to privacy-quarantined quality data. Independent review identified that separate foreign keys, read-then-write review, mutable records without lifecycle events, and an incomplete retention predicate could not independently protect tenant integrity and governance.

## Decision

V1 remains tenant-private. PostgreSQL composite constraints bind the audit run, review ticket and reviewer decision. Submit is atomic and idempotent. Withdraw and manager review lock the row and let the Repository derive a pseudonymous event from the database-real old state; CHECK constraints and a trigger validate the event chain. Events are application-append-only during the submission lifecycle, not WORM, and authorized Retention deletes them with the parent.

Retention has one typed policy and a database-time/governance-version fence against concurrent transitions. It uses a dedicated database URL and strict parser. Execute requires a target-bound confirmation and is allowed only in explicit test/development environments; production execute remains unavailable. A Gold anomaly blocks the tenant, deletes zero records, and persists a minimal anomaly run/audit in a separate transaction. There is no automatic recovery, all-tenant mode or Scheduler.

## Consequences

Concurrent review has one winner and a stable conflict loser. Lifecycle evidence cannot contain raw actor identity or feedback payload. Retention can remove submissions and their events atomically while retaining only minimal run/audit counts. This decision does not authorize production deletion, Gold Set, Shadow mode, training, rule updates, Extension wiring, Ready status, merge, or a human Pilot.
