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
  governance_version INTEGER NOT NULL DEFAULT 0 CHECK (governance_version >= 0),
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

ALTER TABLE learning_feedback_submissions ADD COLUMN IF NOT EXISTS governance_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_feedback_submissions DROP CONSTRAINT IF EXISTS learning_feedback_submissions_governance_version_check;
ALTER TABLE learning_feedback_submissions ADD CONSTRAINT learning_feedback_submissions_governance_version_check CHECK (governance_version >= 0);

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
  request_id TEXT CHECK (request_id IS NULL OR (char_length(request_id) <= 128 AND request_id ~ '^[A-Za-z0-9._:-]+$')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT learning_feedback_event_submission_tenant_fkey
    FOREIGN KEY (learning_feedback_id, tenant_id)
    REFERENCES learning_feedback_submissions (id, tenant_id) ON DELETE CASCADE
);

ALTER TABLE learning_feedback_events DROP CONSTRAINT IF EXISTS learning_feedback_events_event_semantics_check;
ALTER TABLE learning_feedback_events DROP CONSTRAINT IF EXISTS learning_feedback_events_from_status_check;
ALTER TABLE learning_feedback_events ADD CONSTRAINT learning_feedback_events_from_status_check CHECK (
  from_status IS NULL OR from_status IN ('RECEIVED', 'NEEDS_REVIEW', 'PRIVACY_REJECTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PROMOTED_TO_GOLD_SET')
);
ALTER TABLE learning_feedback_events DROP CONSTRAINT IF EXISTS learning_feedback_events_to_status_check;
ALTER TABLE learning_feedback_events ADD CONSTRAINT learning_feedback_events_to_status_check CHECK (
  to_status IN ('RECEIVED', 'NEEDS_REVIEW', 'PRIVACY_REJECTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PROMOTED_TO_GOLD_SET')
);
ALTER TABLE learning_feedback_events ADD CONSTRAINT learning_feedback_events_event_semantics_check CHECK (
  (event_type = 'SUBMITTED' AND from_status IS NULL AND to_status IN ('RECEIVED', 'NEEDS_REVIEW') AND reason_code IS NULL AND reason_note_redacted IS NULL)
  OR (event_type = 'WITHDRAWN' AND from_status IN ('RECEIVED', 'NEEDS_REVIEW') AND to_status = 'WITHDRAWN' AND reason_code IS NULL AND reason_note_redacted IS NULL)
  OR (event_type = 'REVIEW_APPROVED' AND from_status IN ('RECEIVED', 'NEEDS_REVIEW') AND to_status = 'APPROVED' AND reason_code = 'QUALITY_VALIDATED')
  OR (event_type = 'REVIEW_REJECTED' AND from_status IN ('RECEIVED', 'NEEDS_REVIEW') AND to_status = 'REJECTED' AND reason_code IN ('INSUFFICIENT_QUALITY', 'PRIVACY_CONCERN', 'OUT_OF_SCOPE', 'OTHER'))
);
ALTER TABLE learning_feedback_events DROP CONSTRAINT IF EXISTS learning_feedback_events_request_id_check;
ALTER TABLE learning_feedback_events ADD CONSTRAINT learning_feedback_events_request_id_check CHECK (
  request_id IS NULL OR (char_length(request_id) <= 128 AND request_id ~ '^[A-Za-z0-9._:-]+$')
);
ALTER TABLE learning_feedback_events DROP CONSTRAINT IF EXISTS learning_feedback_events_metadata_check;
ALTER TABLE learning_feedback_events ADD CONSTRAINT learning_feedback_events_metadata_check CHECK (metadata = '{}'::jsonb);

CREATE OR REPLACE FUNCTION enforce_learning_feedback_event_truth() RETURNS trigger AS $$
DECLARE
  submission_status TEXT;
  submission_created_at TIMESTAMPTZ;
  submission_updated_at TIMESTAMPTZ;
  previous_status TEXT;
BEGIN
  SELECT status, created_at, updated_at
    INTO submission_status, submission_created_at, submission_updated_at
    FROM learning_feedback_submissions
    WHERE id = NEW.learning_feedback_id AND tenant_id = NEW.tenant_id
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'learning feedback event has no tenant-scoped submission' USING ERRCODE = '23503';
  END IF;
  IF submission_status <> NEW.to_status THEN
    RAISE EXCEPTION 'learning feedback event target does not match submission state' USING ERRCODE = '23514';
  END IF;
  SELECT to_status INTO previous_status
    FROM learning_feedback_events
    WHERE learning_feedback_id = NEW.learning_feedback_id AND tenant_id = NEW.tenant_id
    ORDER BY occurred_at DESC, id DESC LIMIT 1;
  IF NEW.event_type = 'SUBMITTED' THEN
    IF previous_status IS NOT NULL OR NEW.from_status IS NOT NULL OR submission_created_at <> NEW.occurred_at THEN
      RAISE EXCEPTION 'invalid submitted learning feedback event' USING ERRCODE = '23514';
    END IF;
  ELSIF previous_status IS NULL OR previous_status <> NEW.from_status OR submission_updated_at <> NEW.occurred_at THEN
    RAISE EXCEPTION 'learning feedback event does not continue the persisted lifecycle' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learning_feedback_event_truth_trigger ON learning_feedback_events;
CREATE TRIGGER learning_feedback_event_truth_trigger
  BEFORE INSERT ON learning_feedback_events
  FOR EACH ROW EXECUTE FUNCTION enforce_learning_feedback_event_truth();

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
  run_status TEXT NOT NULL CHECK (run_status IN ('SUCCEEDED', 'ANOMALY', 'FAILED')),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code IN ('GOLD_SET_ANOMALY', 'RETENTION_EXECUTION_FAILED')),
  cutoff TIMESTAMPTZ NOT NULL,
  operation_started_at TIMESTAMPTZ NOT NULL,
  batch_limit INTEGER NOT NULL CHECK (batch_limit > 0),
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  deleted_count INTEGER NOT NULL CHECK (deleted_count >= 0),
  counts_by_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  anomaly_count INTEGER NOT NULL CHECK (anomaly_count >= 0),
  actor_pseudonym TEXT NOT NULL,
  pseudonym_key_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE learning_feedback_retention_runs ADD COLUMN IF NOT EXISTS run_status TEXT;
ALTER TABLE learning_feedback_retention_runs ADD COLUMN IF NOT EXISTS failure_code TEXT;
ALTER TABLE learning_feedback_retention_runs ADD COLUMN IF NOT EXISTS operation_started_at TIMESTAMPTZ;
UPDATE learning_feedback_retention_runs SET run_status = 'SUCCEEDED' WHERE run_status IS NULL;
UPDATE learning_feedback_retention_runs SET operation_started_at = occurred_at WHERE operation_started_at IS NULL;
ALTER TABLE learning_feedback_retention_runs ALTER COLUMN run_status SET NOT NULL;
ALTER TABLE learning_feedback_retention_runs ALTER COLUMN operation_started_at SET NOT NULL;
ALTER TABLE learning_feedback_retention_runs DROP CONSTRAINT IF EXISTS learning_feedback_retention_runs_run_status_check;
ALTER TABLE learning_feedback_retention_runs ADD CONSTRAINT learning_feedback_retention_runs_run_status_check CHECK (run_status IN ('SUCCEEDED', 'ANOMALY', 'FAILED'));
ALTER TABLE learning_feedback_retention_runs DROP CONSTRAINT IF EXISTS learning_feedback_retention_runs_failure_code_check;
ALTER TABLE learning_feedback_retention_runs ADD CONSTRAINT learning_feedback_retention_runs_failure_code_check CHECK (
  (run_status = 'SUCCEEDED' AND failure_code IS NULL)
  OR (run_status = 'ANOMALY' AND failure_code = 'GOLD_SET_ANOMALY' AND deleted_count = 0)
  OR (run_status = 'FAILED' AND failure_code = 'RETENTION_EXECUTION_FAILED' AND deleted_count = 0)
);

CREATE INDEX IF NOT EXISTS learning_feedback_retention_runs_tenant_time_idx
  ON learning_feedback_retention_runs (tenant_id, occurred_at);
