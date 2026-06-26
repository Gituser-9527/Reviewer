CREATE TABLE IF NOT EXISTS release_candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target TEXT NOT NULL,
  target_version TEXT NOT NULL,
  rule_version TEXT,
  law_kb_version TEXT,
  model_version TEXT,
  prompt_version TEXT,
  eval_dataset_id TEXT,
  description TEXT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  quality_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS release_candidates_target_status_idx
  ON release_candidates (target, status);

CREATE INDEX IF NOT EXISTS release_candidates_versions_idx
  ON release_candidates (rule_version, law_kb_version, model_version);

CREATE INDEX IF NOT EXISTS release_candidates_updated_at_idx
  ON release_candidates (updated_at);

CREATE TABLE IF NOT EXISTS release_gate_results (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES release_candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  thresholds JSONB NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS release_gate_results_candidate_idx
  ON release_gate_results (candidate_id);

CREATE INDEX IF NOT EXISTS release_gate_results_status_idx
  ON release_gate_results (status);

CREATE TABLE IF NOT EXISTS release_gate_checks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES release_candidates(id) ON DELETE CASCADE,
  gate_result_id TEXT NOT NULL REFERENCES release_gate_results(id) ON DELETE CASCADE,
  check_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  threshold REAL,
  actual JSONB,
  detail TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS release_gate_checks_candidate_idx
  ON release_gate_checks (candidate_id);

CREATE INDEX IF NOT EXISTS release_gate_checks_result_idx
  ON release_gate_checks (gate_result_id);

CREATE INDEX IF NOT EXISTS release_gate_checks_status_idx
  ON release_gate_checks (status);

CREATE TABLE IF NOT EXISTS release_approval_records (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES release_candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  comment_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS release_approval_records_candidate_idx
  ON release_approval_records (candidate_id);

CREATE INDEX IF NOT EXISTS release_approval_records_approver_idx
  ON release_approval_records (approved_by);
