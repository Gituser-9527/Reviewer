CREATE TABLE IF NOT EXISTS appeal_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason_type TEXT NOT NULL,
  reason_text_redacted TEXT NOT NULL,
  supplemental_text_redacted TEXT,
  submitter_id TEXT NOT NULL,
  original_decision TEXT NOT NULL,
  original_risk_level TEXT NOT NULL,
  original_findings JSONB NOT NULL,
  original_evidence JSONB NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appeal_cases_tenant_status_idx
  ON appeal_cases (tenant_id, status);

CREATE INDEX IF NOT EXISTS appeal_cases_audit_run_idx
  ON appeal_cases (audit_run_id);

CREATE INDEX IF NOT EXISTS appeal_cases_reason_type_idx
  ON appeal_cases (reason_type);

CREATE TABLE IF NOT EXISTS appeal_messages (
  id TEXT PRIMARY KEY,
  appeal_case_id TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  message_redacted TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appeal_messages_case_created_at_idx
  ON appeal_messages (appeal_case_id, created_at);

CREATE INDEX IF NOT EXISTS appeal_messages_tenant_idx
  ON appeal_messages (tenant_id);

CREATE TABLE IF NOT EXISTS appeal_review_results (
  id TEXT PRIMARY KEY,
  appeal_case_id TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  final_decision TEXT NOT NULL,
  comment_redacted TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS appeal_review_results_case_idx
  ON appeal_review_results (appeal_case_id);

CREATE INDEX IF NOT EXISTS appeal_review_results_tenant_decision_idx
  ON appeal_review_results (tenant_id, final_decision);

CREATE TABLE IF NOT EXISTS appeal_agent_reports (
  id TEXT PRIMARY KEY,
  appeal_case_id TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  maintain_reasons JSONB NOT NULL,
  overturn_reasons JSONB NOT NULL,
  evidence_summary TEXT NOT NULL,
  similar_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation TEXT NOT NULL,
  confidence REAL NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appeal_agent_reports_case_idx
  ON appeal_agent_reports (appeal_case_id);

CREATE INDEX IF NOT EXISTS appeal_agent_reports_tenant_idx
  ON appeal_agent_reports (tenant_id);
