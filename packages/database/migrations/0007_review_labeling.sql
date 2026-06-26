CREATE TABLE IF NOT EXISTS reviewer_decisions (
  id TEXT PRIMARY KEY,
  review_ticket_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  final_decision TEXT NOT NULL,
  normalized_decision TEXT NOT NULL,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  comment_redacted TEXT,
  confidence REAL NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reviewer_decisions_ticket_reviewer_idx
  ON reviewer_decisions (review_ticket_id, reviewer_id);

CREATE INDEX IF NOT EXISTS reviewer_decisions_ticket_idx
  ON reviewer_decisions (review_ticket_id);

CREATE INDEX IF NOT EXISTS reviewer_decisions_reviewer_idx
  ON reviewer_decisions (reviewer_id);

CREATE TABLE IF NOT EXISTS reviewer_agreement_stats (
  reviewer_id TEXT PRIMARY KEY,
  total_labeled INTEGER NOT NULL DEFAULT 0,
  agreement_count INTEGER NOT NULL DEFAULT 0,
  disagreement_count INTEGER NOT NULL DEFAULT 0,
  agreement_rate REAL NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviewer_agreement_stats_rate_idx
  ON reviewer_agreement_stats (agreement_rate);

CREATE TABLE IF NOT EXISTS disputed_cases (
  id TEXT PRIMARY KEY,
  review_ticket_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewer_decision_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_decision TEXT,
  final_categories JSONB,
  final_severity TEXT,
  resolved_by TEXT,
  resolution_comment_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS disputed_cases_review_ticket_idx
  ON disputed_cases (review_ticket_id);

CREATE INDEX IF NOT EXISTS disputed_cases_tenant_status_idx
  ON disputed_cases (tenant_id, status);

CREATE INDEX IF NOT EXISTS disputed_cases_audit_run_idx
  ON disputed_cases (audit_run_id);
