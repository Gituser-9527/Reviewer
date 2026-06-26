CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  external_id text,
  title text NOT NULL,
  company_name text,
  location text,
  employment_type text,
  salary_text text,
  raw_text_redacted text NOT NULL,
  input_hash text NOT NULL,
  input_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_postings_tenant_input_hash_idx
  ON job_postings (tenant_id, input_hash);

CREATE INDEX IF NOT EXISTS job_postings_tenant_created_at_idx
  ON job_postings (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  job_posting_id uuid NOT NULL REFERENCES job_postings(id),
  decision text NOT NULL,
  risk_level text NOT NULL,
  summary text NOT NULL,
  rule_version text NOT NULL,
  law_kb_version text NOT NULL,
  input_hash text NOT NULL,
  result_payload jsonb NOT NULL,
  evaluated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_runs_tenant_created_at_idx
  ON audit_runs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_runs_tenant_decision_idx
  ON audit_runs (tenant_id, decision);

CREATE INDEX IF NOT EXISTS audit_runs_tenant_risk_level_idx
  ON audit_runs (tenant_id, risk_level);

CREATE TABLE IF NOT EXISTS audit_findings (
  audit_run_id text NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  tenant_id text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  decision text NOT NULL,
  rule_id text,
  evidence_id text,
  title text NOT NULL,
  message text NOT NULL,
  suggestion text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_run_id, finding_id)
);

CREATE INDEX IF NOT EXISTS audit_findings_tenant_run_idx
  ON audit_findings (tenant_id, audit_run_id);

CREATE INDEX IF NOT EXISTS audit_findings_tenant_category_idx
  ON audit_findings (tenant_id, category);

CREATE INDEX IF NOT EXISTS audit_findings_tenant_rule_idx
  ON audit_findings (tenant_id, rule_id);

CREATE TABLE IF NOT EXISTS audit_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id text NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  finding_id text,
  tenant_id text NOT NULL,
  evidence_id text NOT NULL,
  source_type text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  version text NOT NULL,
  quote_redacted text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_evidence_links_tenant_run_idx
  ON audit_evidence_links (tenant_id, audit_run_id);

CREATE INDEX IF NOT EXISTS audit_evidence_links_evidence_idx
  ON audit_evidence_links (evidence_id);

CREATE TABLE IF NOT EXISTS compliance_rules (
  rule_id text NOT NULL,
  rule_version text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  action text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  source_path text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, rule_version)
);

CREATE INDEX IF NOT EXISTS compliance_rules_category_idx
  ON compliance_rules (category);

CREATE TABLE IF NOT EXISTS human_review_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id text NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  reviewer_id text NOT NULL,
  decision text NOT NULL,
  comment_redacted text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS human_review_feedback_tenant_run_idx
  ON human_review_feedback (tenant_id, audit_run_id);
