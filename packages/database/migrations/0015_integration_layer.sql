CREATE TABLE IF NOT EXISTS integration_clients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_clients_tenant_env_idx
  ON integration_clients (tenant_id, environment);

CREATE INDEX IF NOT EXISTS integration_clients_status_idx
  ON integration_clients (status);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_hash TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant_status_idx
  ON webhook_endpoints (tenant_id, status);

CREATE INDEX IF NOT EXISTS webhook_endpoints_events_idx
  ON webhook_endpoints (tenant_id);

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  event TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_code INTEGER,
  error_redacted TEXT,
  signature TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_delivery_logs_tenant_created_at_idx
  ON webhook_delivery_logs (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS webhook_delivery_logs_endpoint_idx
  ON webhook_delivery_logs (endpoint_id);

CREATE INDEX IF NOT EXISTS webhook_delivery_logs_status_idx
  ON webhook_delivery_logs (status);

CREATE TABLE IF NOT EXISTS sandbox_audit_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  input_payload JSONB NOT NULL,
  result_payload JSONB NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sandbox_audit_runs_tenant_created_at_idx
  ON sandbox_audit_runs (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS sandbox_audit_runs_audit_run_idx
  ON sandbox_audit_runs (audit_run_id);
