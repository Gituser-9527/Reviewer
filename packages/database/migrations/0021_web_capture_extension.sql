CREATE TABLE IF NOT EXISTS web_captures (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
  source_type TEXT NOT NULL, page_url TEXT, page_url_hash TEXT NOT NULL, page_title TEXT,
  adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, adapter_confidence DOUBLE PRECISION,
  completeness_score DOUBLE PRECISION NOT NULL, extraction_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  captured_job JSONB NOT NULL, sanitized_main_text TEXT, structured_data JSONB,
  status TEXT NOT NULL, retention_expires_at TIMESTAMPTZ, raw_content_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_captures_tenant_created_idx ON web_captures (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS web_captures_tenant_user_idx ON web_captures (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS web_captures_url_hash_idx ON web_captures (tenant_id, page_url_hash);
CREATE INDEX IF NOT EXISTS web_captures_status_idx ON web_captures (status);
CREATE INDEX IF NOT EXISTS web_captures_retention_idx ON web_captures (retention_expires_at);

CREATE TABLE IF NOT EXISTS web_capture_field_corrections (
  id TEXT PRIMARY KEY, capture_id TEXT NOT NULL REFERENCES web_captures(id), tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL, field_name TEXT NOT NULL, original_value JSONB, corrected_value JSONB NOT NULL,
  original_source TEXT, correction_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_capture_corrections_capture_idx ON web_capture_field_corrections (capture_id, created_at);
CREATE INDEX IF NOT EXISTS web_capture_corrections_tenant_idx ON web_capture_field_corrections (tenant_id);

CREATE TABLE IF NOT EXISTS extension_authorizations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, extension_client_id TEXT NOT NULL,
  scopes JSONB NOT NULL, status TEXT NOT NULL, token_hash TEXT, refresh_token_hash TEXT,
  last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extension_authorizations_tenant_user_idx ON extension_authorizations (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS extension_authorizations_client_idx ON extension_authorizations (extension_client_id);
ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS web_capture_id TEXT REFERENCES web_captures(id);
CREATE INDEX IF NOT EXISTS audit_runs_web_capture_idx ON audit_runs (web_capture_id);
