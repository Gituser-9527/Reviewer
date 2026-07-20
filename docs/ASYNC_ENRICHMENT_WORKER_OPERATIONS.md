# Async enrichment worker operations

The worker reuses `async_jobs`. Claiming uses `FOR UPDATE SKIP LOCKED`; expired locks return jobs to retry. The tenant-scoped idempotency key has a database unique index. Workers process `AUDIT_GENERATE_EXPLANATIONS` and `AUDIT_GENERATE_REWRITE`, resolve the active tenant-owned provider, record usage for the provider actually resolved, retry with bounded backoff, then dead-letter after max attempts. `MockEnrichmentProvider` is available only through explicit test or local injection; production has no automatic Mock fallback. If no active tenant connection is available, the worker records the controlled `LLM_CONNECTION_UNAVAILABLE` outcome and dead-letters the job without a provider call.

Run once: `npm run worker:enrichment:once`. Run continuously: `npm run worker:enrichment`. Configure `WORKER_ID` to identify a process.
