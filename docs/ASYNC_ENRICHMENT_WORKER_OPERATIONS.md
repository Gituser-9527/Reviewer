# Async enrichment worker operations

The worker reuses `async_jobs`. Claiming uses `FOR UPDATE SKIP LOCKED`; expired locks return jobs to retry. The tenant-scoped idempotency key has a database unique index. Workers process `AUDIT_GENERATE_EXPLANATIONS` and `AUDIT_GENERATE_REWRITE`, write mock usage, retry with bounded backoff, then dead-letter after max attempts.

Run once: `npm run worker:enrichment:once`. Run continuously: `npm run worker:enrichment`. Configure `WORKER_ID` to identify a process.
