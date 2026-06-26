CREATE TABLE IF NOT EXISTS trusted_knowledge_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trusted_sources_jurisdiction_scope_idx
  ON trusted_knowledge_sources (jurisdiction, scope);

CREATE INDEX IF NOT EXISTS trusted_sources_status_idx
  ON trusted_knowledge_sources (status);

CREATE TABLE IF NOT EXISTS law_kb_documents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  scope TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS law_kb_documents_source_idx
  ON law_kb_documents (source_id);

CREATE INDEX IF NOT EXISTS law_kb_documents_scope_idx
  ON law_kb_documents (jurisdiction, scope);

CREATE TABLE IF NOT EXISTS law_kb_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_redacted TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS law_kb_document_versions_doc_version_idx
  ON law_kb_document_versions (document_id, version);

CREATE INDEX IF NOT EXISTS law_kb_document_versions_hash_idx
  ON law_kb_document_versions (content_hash);

CREATE TABLE IF NOT EXISTS law_kb_update_suggestions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  from_version TEXT,
  to_version TEXT NOT NULL,
  status TEXT NOT NULL,
  diff JSONB NOT NULL,
  impact_summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS law_kb_update_suggestions_status_idx
  ON law_kb_update_suggestions (status);

CREATE INDEX IF NOT EXISTS law_kb_update_suggestions_document_idx
  ON law_kb_update_suggestions (document_id);

CREATE TABLE IF NOT EXISTS law_kb_version_records (
  id TEXT PRIMARY KEY,
  law_kb_version TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  eval_run_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS law_kb_version_records_version_idx
  ON law_kb_version_records (law_kb_version);

CREATE INDEX IF NOT EXISTS law_kb_version_records_suggestion_idx
  ON law_kb_version_records (suggestion_id);

CREATE TABLE IF NOT EXISTS law_kb_impact_reports (
  id TEXT PRIMARY KEY,
  suggestion_id TEXT NOT NULL,
  affected_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS law_kb_impact_reports_suggestion_idx
  ON law_kb_impact_reports (suggestion_id);
