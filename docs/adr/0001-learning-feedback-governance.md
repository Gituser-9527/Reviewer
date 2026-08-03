# ADR 0001: Tenant-private Learning Feedback governance

- Status: Accepted for V1 foundation
- Date: 2026-08-03

## Context

Learning Feedback links an authenticated human decision to privacy-quarantined quality data. Independent review identified that separate foreign keys, read-then-write review, mutable records without lifecycle events, and an incomplete retention predicate could not independently protect tenant integrity and governance.

## Decision

V1 remains tenant-private. PostgreSQL composite constraints bind the audit run, review ticket and reviewer decision. Submit is atomic and idempotent. Withdraw and manager review use tenant-scoped compare-and-set transitions, and each successful transition writes one append-only, pseudonymous domain event in the same transaction.

Retention has one typed policy: eligible non-Gold records expire at the policy time, withdrawn records are immediately eligible at `withdrawnAt`, and reserved Gold records make execute fail closed. Dry-run and execute are explicit internal commands; execute additionally requires confirmation, an environment guard and a bounded tenant-scoped batch. There is no all-tenant mode or Scheduler.

## Consequences

Concurrent review has one winner and a stable conflict loser. Lifecycle evidence cannot contain raw actor identity or feedback payload. Retention can remove submissions and their events atomically while retaining only minimal run/audit counts. This decision does not authorize production deletion, Gold Set, Shadow mode, training, rule updates, Extension wiring, Ready status, merge, or a human Pilot.
