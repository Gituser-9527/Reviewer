CREATE TABLE IF NOT EXISTS async_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  batch_id TEXT,
  batch_item_id TEXT,
  audit_run_id TEXT,
  error_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS async_jobs_tenant_status_idx
  ON async_jobs (tenant_id, status);

CREATE INDEX IF NOT EXISTS async_jobs_batch_idx
  ON async_jobs (batch_id);

CREATE TABLE IF NOT EXISTS batch_audit_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  job_posting_id TEXT NOT NULL,
  status TEXT NOT NULL,
  audit_run_id TEXT,
  error_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS batch_audit_items_batch_idx
  ON batch_audit_items (batch_id);

CREATE INDEX IF NOT EXISTS batch_audit_items_tenant_status_idx
  ON batch_audit_items (tenant_id, status);

CREATE TABLE IF NOT EXISTS llm_usage_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_usage_records_tenant_created_at_idx
  ON llm_usage_records (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS llm_usage_records_audit_run_idx
  ON llm_usage_records (audit_run_id);

CREATE TABLE IF NOT EXISTS cost_usage_daily (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  usage_date TIMESTAMPTZ NOT NULL,
  audit_count INTEGER NOT NULL DEFAULT 0,
  llm_tokens_in INTEGER NOT NULL DEFAULT 0,
  llm_tokens_out INTEGER NOT NULL DEFAULT 0,
  llm_cost REAL NOT NULL DEFAULT 0,
  rag_cost REAL NOT NULL DEFAULT 0,
  rule_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cost_usage_daily_tenant_date_idx
  ON cost_usage_daily (tenant_id, usage_date);

CREATE INDEX IF NOT EXISTS cost_usage_daily_tenant_idx
  ON cost_usage_daily (tenant_id);

CREATE TABLE IF NOT EXISTS rate_limit_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  api_key_id TEXT,
  limit_type TEXT NOT NULL,
  limit_value INTEGER NOT NULL,
  used_value INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_records_tenant_window_idx
  ON rate_limit_records (tenant_id, window_start);

CREATE INDEX IF NOT EXISTS rate_limit_records_api_key_idx
  ON rate_limit_records (api_key_id);
