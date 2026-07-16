# LLM usage and routing trace operations

`llm_usage_records` is extended in migration 0022 with nullable token/cost fields, provider/model/task metadata and `is_mock`. Unknown provider usage is stored as null rather than zero. No prompt, authorization header, API key or raw job text is stored.

`audit_routing_traces` is tenant-scoped and stores stage metadata only. `GET /api/audit/runs/:id/routing-trace` returns a summary to non-admin users and full trace to tenant administrators. Usage is available per audit run at `/api/audit/runs/:id/llm-usage`.
