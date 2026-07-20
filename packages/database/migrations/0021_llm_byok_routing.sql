CREATE TABLE IF NOT EXISTS llm_connections (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, display_name TEXT NOT NULL, provider TEXT NOT NULL,
  base_url TEXT, encrypted_api_key JSONB NOT NULL, api_key_last_four TEXT, audit_model TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL, max_output_tokens INTEGER NOT NULL, temperature REAL NOT NULL,
  max_retries INTEGER NOT NULL, status TEXT NOT NULL, is_default BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ, last_failure_at TIMESTAMPTZ,
  last_error_code TEXT, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS llm_connections_tenant_status_idx ON llm_connections (tenant_id, status);
CREATE INDEX IF NOT EXISTS llm_connections_tenant_default_idx ON llm_connections (tenant_id, is_default);
CREATE UNIQUE INDEX IF NOT EXISTS llm_connections_one_default_per_tenant_idx ON llm_connections (tenant_id) WHERE is_default AND status = 'ACTIVE';
CREATE TABLE IF NOT EXISTS audit_routing_policies (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, version TEXT NOT NULL, enabled BOOLEAN NOT NULL,
  payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
