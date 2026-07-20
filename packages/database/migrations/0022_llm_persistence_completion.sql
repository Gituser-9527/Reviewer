-- Round 61: extend existing persistence tables; historic migrations remain immutable.
CREATE TABLE IF NOT EXISTS audit_routing_policy_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, version)
);
CREATE INDEX IF NOT EXISTS audit_routing_policy_versions_tenant_idx ON audit_routing_policy_versions (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_routing_traces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  trace JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, audit_run_id)
);
CREATE INDEX IF NOT EXISTS audit_routing_traces_audit_idx ON audit_routing_traces (tenant_id, audit_run_id);

ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS connection_id TEXT;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS async_job_id TEXT;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS task_type TEXT;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS cached_tokens INTEGER;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS success BOOLEAN;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS estimated_cost REAL;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS pricing_version TEXT;
ALTER TABLE llm_usage_records ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS llm_usage_records_tenant_filter_idx ON llm_usage_records (tenant_id, provider, model, task_type, created_at DESC);

ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS async_jobs_tenant_idempotency_idx ON async_jobs (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS async_jobs_claim_idx ON async_jobs (status, type, available_at) WHERE status IN ('PENDING', 'RETRY_WAIT');
