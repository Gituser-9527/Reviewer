# Production enrichment worker

The existing worker remains queue/lock/retry capable. Provider resolution is tenant/default-connection scoped; no production fallback to Mock is permitted.
