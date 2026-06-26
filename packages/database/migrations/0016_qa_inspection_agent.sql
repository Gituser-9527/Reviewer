CREATE TABLE IF NOT EXISTS qa_inspection_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  rule_version TEXT,
  reviewer_id TEXT,
  include_appeals BOOLEAN NOT NULL DEFAULT TRUE,
  include_rewrites BOOLEAN NOT NULL DEFAULT TRUE,
  include_evidence BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  created_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS qa_inspection_jobs_tenant_created_at_idx
  ON qa_inspection_jobs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS qa_inspection_jobs_rule_version_idx
  ON qa_inspection_jobs (rule_version);
CREATE INDEX IF NOT EXISTS qa_inspection_jobs_status_idx
  ON qa_inspection_jobs (status);

CREATE TABLE IF NOT EXISTS qa_inspection_samples (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES qa_inspection_jobs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  audit_run_id TEXT,
  reviewer_id TEXT,
  rule_version TEXT,
  risk_level TEXT,
  decision TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qa_inspection_samples_job_idx
  ON qa_inspection_samples (job_id);
CREATE INDEX IF NOT EXISTS qa_inspection_samples_tenant_source_idx
  ON qa_inspection_samples (tenant_id, source_type);
CREATE INDEX IF NOT EXISTS qa_inspection_samples_audit_run_idx
  ON qa_inspection_samples (audit_run_id);
CREATE INDEX IF NOT EXISTS qa_inspection_samples_reviewer_idx
  ON qa_inspection_samples (reviewer_id);
CREATE INDEX IF NOT EXISTS qa_inspection_samples_rule_version_idx
  ON qa_inspection_samples (rule_version);

CREATE TABLE IF NOT EXISTS qa_inspection_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES qa_inspection_jobs(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL REFERENCES qa_inspection_samples(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  score INTEGER NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qa_inspection_results_job_idx
  ON qa_inspection_results (job_id);
CREATE INDEX IF NOT EXISTS qa_inspection_results_sample_idx
  ON qa_inspection_results (sample_id);
CREATE INDEX IF NOT EXISTS qa_inspection_results_passed_idx
  ON qa_inspection_results (passed);

CREATE TABLE IF NOT EXISTS qa_quality_issues (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES qa_inspection_jobs(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL REFERENCES qa_inspection_samples(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  linked_eval_case_id TEXT,
  linked_rule_suggestion_id TEXT,
  resolved_by TEXT,
  resolution_comment_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS qa_quality_issues_tenant_status_idx
  ON qa_quality_issues (tenant_id, status);
CREATE INDEX IF NOT EXISTS qa_quality_issues_job_idx
  ON qa_quality_issues (job_id);
CREATE INDEX IF NOT EXISTS qa_quality_issues_source_idx
  ON qa_quality_issues (source_type, source_id);
CREATE INDEX IF NOT EXISTS qa_quality_issues_issue_type_idx
  ON qa_quality_issues (issue_type);
