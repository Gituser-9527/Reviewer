CREATE TABLE IF NOT EXISTS eval_datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL,
  expected_decision TEXT NOT NULL,
  expected_categories JSONB NOT NULL,
  expected_severity TEXT,
  human_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS eval_cases_dataset_idx
  ON eval_cases (dataset_id);

CREATE INDEX IF NOT EXISTS eval_cases_expected_decision_idx
  ON eval_cases (expected_decision);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  law_kb_version TEXT,
  model_version TEXT,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  decision_accuracy REAL NOT NULL,
  category_recall REAL NOT NULL,
  category_precision REAL NOT NULL,
  high_risk_recall REAL NOT NULL,
  critical_recall REAL NOT NULL,
  false_positive_rate REAL NOT NULL,
  false_negative_rate REAL NOT NULL,
  manual_review_rate REAL NOT NULL,
  evidence_accuracy REAL NOT NULL,
  rewrite_safety_rate REAL NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS eval_runs_dataset_created_at_idx
  ON eval_runs (dataset_id, created_at);

CREATE INDEX IF NOT EXISTS eval_runs_rule_version_idx
  ON eval_runs (rule_version);

CREATE TABLE IF NOT EXISTS eval_failures (
  id TEXT PRIMARY KEY,
  eval_run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  expected JSONB NOT NULL,
  actual JSONB NOT NULL,
  failure_type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS eval_failures_run_idx
  ON eval_failures (eval_run_id);

CREATE INDEX IF NOT EXISTS eval_failures_case_idx
  ON eval_failures (case_id);

CREATE INDEX IF NOT EXISTS eval_failures_failure_type_idx
  ON eval_failures (failure_type);
