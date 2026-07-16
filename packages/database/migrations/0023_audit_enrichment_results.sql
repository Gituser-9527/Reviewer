CREATE TABLE IF NOT EXISTS audit_enrichment_records (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, audit_run_id TEXT NOT NULL,
  task_type TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL,
  result JSONB, safety_result JSONB, error_code TEXT, prompt_version TEXT, provider TEXT, model TEXT,
  is_mock BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, audit_run_id, task_type, version)
);
CREATE INDEX IF NOT EXISTS audit_enrichment_records_current_idx ON audit_enrichment_records (tenant_id, audit_run_id, task_type, version DESC);
