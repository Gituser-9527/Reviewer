CREATE TABLE IF NOT EXISTS reviewer_training_completed (
  id TEXT PRIMARY KEY,
  reviewer_id TEXT NOT NULL,
  tenant_id TEXT,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  document_version TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reviewer_training_completed_reviewer_tenant_idx
  ON reviewer_training_completed (reviewer_id, tenant_id);
CREATE INDEX IF NOT EXISTS reviewer_training_completed_tenant_idx
  ON reviewer_training_completed (tenant_id);
