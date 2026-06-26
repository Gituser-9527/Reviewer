CREATE TABLE IF NOT EXISTS data_retention_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  resource_type TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_retention_jobs_tenant_resource_idx
  ON data_retention_jobs (tenant_id, resource_type);

CREATE INDEX IF NOT EXISTS data_retention_jobs_enabled_idx
  ON data_retention_jobs (enabled);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  status TEXT NOT NULL,
  deleted_records INTEGER NOT NULL DEFAULT 0,
  reason_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS data_deletion_requests_tenant_status_idx
  ON data_deletion_requests (tenant_id, status);

CREATE INDEX IF NOT EXISTS data_deletion_requests_requester_idx
  ON data_deletion_requests (requester_id);

CREATE TABLE IF NOT EXISTS privacy_export_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  status TEXT NOT NULL,
  export_payload JSONB,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS privacy_export_requests_tenant_status_idx
  ON privacy_export_requests (tenant_id, status);

CREATE INDEX IF NOT EXISTS privacy_export_requests_requester_idx
  ON privacy_export_requests (requester_id);

CREATE TABLE IF NOT EXISTS security_check_results (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  checks JSONB NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_check_results_status_idx
  ON security_check_results (status);

CREATE INDEX IF NOT EXISTS security_check_results_created_at_idx
  ON security_check_results (created_at);
