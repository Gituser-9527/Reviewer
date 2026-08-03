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
CREATE UNIQUE INDEX IF NOT EXISTS learning_feedback_id_tenant_uidx
  ON learning_feedback_submissions (id, tenant_id);
CREATE INDEX IF NOT EXISTS learning_feedback_tenant_status_idx
  ON learning_feedback_submissions (tenant_id, status);
CREATE INDEX IF NOT EXISTS learning_feedback_retention_idx
  ON learning_feedback_submissions (retention_expires_at, status);
CREATE INDEX IF NOT EXISTS learning_feedback_ticket_idx
  ON learning_feedback_submissions (human_review_ticket_id);

CREATE TABLE IF NOT EXISTS learning_feedback_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  learning_feedback_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('SUBMITTED', 'WITHDRAWN', 'REVIEW_APPROVED', 'REVIEW_REJECTED')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_pseudonym TEXT NOT NULL,
  pseudonym_key_version TEXT NOT NULL,
  reason_code TEXT CHECK (reason_code IN ('QUALITY_VALIDATED', 'INSUFFICIENT_QUALITY', 'PRIVACY_CONCERN', 'OUT_OF_SCOPE', 'OTHER')),
  reason_note_redacted TEXT,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT learning_feedback_event_submission_tenant_fkey
    FOREIGN KEY (learning_feedback_id, tenant_id)
    REFERENCES learning_feedback_submissions (id, tenant_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_feedback_event_submitted_uidx
  ON learning_feedback_events (learning_feedback_id) WHERE event_type = 'SUBMITTED';
CREATE UNIQUE INDEX IF NOT EXISTS learning_feedback_event_withdrawn_uidx
  ON learning_feedback_events (learning_feedback_id) WHERE event_type = 'WITHDRAWN';
CREATE UNIQUE INDEX IF NOT EXISTS learning_feedback_event_review_uidx
  ON learning_feedback_events (learning_feedback_id)
  WHERE event_type IN ('REVIEW_APPROVED', 'REVIEW_REJECTED');
CREATE INDEX IF NOT EXISTS learning_feedback_events_tenant_feedback_idx
  ON learning_feedback_events (tenant_id, learning_feedback_id, occurred_at);

CREATE TABLE IF NOT EXISTS learning_feedback_retention_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('DRY_RUN', 'EXECUTE')),
  cutoff TIMESTAMPTZ NOT NULL,
  batch_limit INTEGER NOT NULL CHECK (batch_limit > 0),
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  deleted_count INTEGER NOT NULL CHECK (deleted_count >= 0),
  counts_by_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  anomaly_count INTEGER NOT NULL CHECK (anomaly_count >= 0),
  actor_pseudonym TEXT NOT NULL,
  pseudonym_key_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_feedback_retention_runs_tenant_time_idx
  ON learning_feedback_retention_runs (tenant_id, occurred_at);
