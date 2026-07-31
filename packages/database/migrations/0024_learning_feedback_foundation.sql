CREATE TABLE IF NOT EXISTS learning_feedback_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL REFERENCES audit_runs(id) ON DELETE RESTRICT,
  human_review_ticket_id TEXT NOT NULL REFERENCES review_tickets(id) ON DELETE RESTRICT,
  reviewer_decision_id TEXT NOT NULL REFERENCES human_review_feedback(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('WEB', 'EXTENSION', 'API')),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'NEEDS_REVIEW', 'PRIVACY_REJECTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PROMOTED_TO_GOLD_SET')),
  consent_scope TEXT NOT NULL CHECK (consent_scope = 'TENANT_PRIVATE'),
  consent_notice_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  purpose TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  retention_expires_at TIMESTAMPTZ NOT NULL,
  reviewer_pseudonym TEXT NOT NULL,
  pseudonym_key_version TEXT NOT NULL,
  digest TEXT NOT NULL,
  sanitized_comment TEXT NOT NULL,
  sanitized_evidence_fragments JSONB NOT NULL DEFAULT '[]'::jsonb,
  redaction_summary JSONB NOT NULL,
  agent_decision TEXT NOT NULL,
  human_decision TEXT NOT NULL,
  rule_version TEXT,
  law_kb_version TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  superseded_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_feedback_idempotency_idx
  ON learning_feedback_submissions (tenant_id, reviewer_decision_id, digest, consent_notice_version);
CREATE INDEX IF NOT EXISTS learning_feedback_tenant_status_idx
  ON learning_feedback_submissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS learning_feedback_retention_idx
  ON learning_feedback_submissions (retention_expires_at, status);
CREATE INDEX IF NOT EXISTS learning_feedback_ticket_idx
  ON learning_feedback_submissions (human_review_ticket_id);
