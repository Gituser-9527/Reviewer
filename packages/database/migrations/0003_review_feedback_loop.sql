CREATE TABLE IF NOT EXISTS review_tickets (
  id TEXT PRIMARY KEY,
  audit_run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  agent_decision TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  summary_redacted TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS review_tickets_audit_run_idx
  ON review_tickets (audit_run_id);

CREATE INDEX IF NOT EXISTS review_tickets_tenant_status_idx
  ON review_tickets (tenant_id, status);

CREATE INDEX IF NOT EXISTS review_tickets_tenant_created_at_idx
  ON review_tickets (tenant_id, created_at DESC);

ALTER TABLE human_review_feedback
  ADD COLUMN IF NOT EXISTS review_ticket_id TEXT REFERENCES review_tickets(id) ON DELETE CASCADE;

ALTER TABLE human_review_feedback
  ADD COLUMN IF NOT EXISTS agent_decision TEXT;

ALTER TABLE human_review_feedback
  ADD COLUMN IF NOT EXISTS final_decision TEXT;

ALTER TABLE human_review_feedback
  ADD COLUMN IF NOT EXISTS feedback_type TEXT;

CREATE TABLE IF NOT EXISTS rule_improvement_suggestions (
  id TEXT PRIMARY KEY,
  review_ticket_id TEXT NOT NULL REFERENCES review_tickets(id) ON DELETE CASCADE,
  audit_run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  category TEXT,
  rule_id TEXT,
  title TEXT NOT NULL,
  description_redacted TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  resolved_by TEXT,
  resolution_comment_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rule_suggestions_tenant_status_idx
  ON rule_improvement_suggestions (tenant_id, status);

CREATE INDEX IF NOT EXISTS rule_suggestions_review_ticket_idx
  ON rule_improvement_suggestions (review_ticket_id);

CREATE INDEX IF NOT EXISTS rule_suggestions_rule_idx
  ON rule_improvement_suggestions (rule_id);
