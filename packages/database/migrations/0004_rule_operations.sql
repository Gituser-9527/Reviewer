CREATE TABLE IF NOT EXISTS rule_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  status TEXT NOT NULL,
  current_version TEXT,
  description TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rule_sets_jurisdiction_status_idx
  ON rule_sets (jurisdiction, status);

CREATE INDEX IF NOT EXISTS rule_sets_updated_at_idx
  ON rule_sets (updated_at DESC);

ALTER TABLE compliance_rules
  ADD COLUMN IF NOT EXISTS rule_set_id TEXT;

ALTER TABLE compliance_rules
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS compliance_rules_rule_set_idx
  ON compliance_rules (rule_set_id);

CREATE INDEX IF NOT EXISTS compliance_rules_status_idx
  ON compliance_rules (status);

CREATE TABLE IF NOT EXISTS rule_publish_records (
  id TEXT PRIMARY KEY,
  rule_set_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  previous_version TEXT,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  eval_passed BOOLEAN NOT NULL,
  force_published BOOLEAN NOT NULL DEFAULT false,
  rule_count INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rule_publish_records_rule_set_idx
  ON rule_publish_records (rule_set_id);

CREATE INDEX IF NOT EXISTS rule_publish_records_version_idx
  ON rule_publish_records (rule_version);

CREATE INDEX IF NOT EXISTS rule_publish_records_created_at_idx
  ON rule_publish_records (created_at DESC);
