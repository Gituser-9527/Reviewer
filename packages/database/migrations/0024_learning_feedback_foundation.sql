CREATE UNIQUE INDEX IF NOT EXISTS audit_runs_learning_feedback_chain_uidx
  ON audit_runs (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS review_tickets_learning_feedback_chain_uidx
  ON review_tickets (id, audit_run_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS human_review_feedback_learning_feedback_chain_uidx
  ON human_review_feedback (id, review_ticket_id, audit_run_id, tenant_id);

CREATE TABLE IF NOT EXISTS learning_feedback_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  human_review_ticket_id TEXT NOT NULL,
  reviewer_decision_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source = 'API'),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'NEEDS_REVIEW', 'PRIVACY_REJECTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PROMOTED_TO_GOLD_SET')),
  consent_scope TEXT NOT NULL CHECK (consent_scope = 'TENANT_PRIVATE'),
  consent_notice_version TEXT NOT NULL CHECK (consent_notice_version = 'learning-feedback-v1'),
  consented_at TIMESTAMPTZ NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose = 'QUALITY_IMPROVEMENT_REVIEW'),
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
  superseded_by TEXT,
  CONSTRAINT learning_feedback_audit_tenant_fkey
    FOREIGN KEY (audit_run_id, tenant_id)
    REFERENCES audit_runs (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT learning_feedback_ticket_chain_fkey
    FOREIGN KEY (human_review_ticket_id, audit_run_id, tenant_id)
    REFERENCES review_tickets (id, audit_run_id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT learning_feedback_decision_chain_fkey
    FOREIGN KEY (reviewer_decision_id, human_review_ticket_id, audit_run_id, tenant_id)
    REFERENCES human_review_feedback (id, review_ticket_id, audit_run_id, tenant_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_feedback_idempotency_idx
  ON learning_feedback_submissions (tenant_id, reviewer_decision_id, digest, consent_notice_version);
CREATE INDEX IF NOT EXISTS learning_feedback_tenant_status_idx
  ON learning_feedback_submissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS learning_feedback_retention_idx
  ON learning_feedback_submissions (retention_expires_at, status);
CREATE INDEX IF NOT EXISTS learning_feedback_ticket_idx
  ON learning_feedback_submissions (human_review_ticket_id);
