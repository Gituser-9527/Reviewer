ALTER TABLE audit_runs
  ADD COLUMN IF NOT EXISTS model_version TEXT;

CREATE TABLE IF NOT EXISTS runtime_configs (
  key TEXT PRIMARY KEY,
  stable_version TEXT NOT NULL,
  candidate_version TEXT,
  description TEXT,
  updated_by TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_configs_updated_at_idx
  ON runtime_configs (updated_at);

CREATE TABLE IF NOT EXISTS rollout_plans (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  stable_version TEXT NOT NULL,
  candidate_version TEXT NOT NULL,
  tenant_allow_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollout_percent REAL NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  description TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rollout_plans_target_status_idx
  ON rollout_plans (target, status);

CREATE INDEX IF NOT EXISTS rollout_plans_updated_at_idx
  ON rollout_plans (updated_at);

CREATE TABLE IF NOT EXISTS audit_metrics_daily (
  id TEXT PRIMARY KEY,
  metric_date TIMESTAMPTZ NOT NULL,
  tenant_id TEXT,
  rule_version TEXT,
  law_kb_version TEXT,
  model_version TEXT,
  audit_total INTEGER NOT NULL DEFAULT 0,
  reject_total INTEGER NOT NULL DEFAULT 0,
  manual_review_total INTEGER NOT NULL DEFAULT 0,
  critical_finding_total INTEGER NOT NULL DEFAULT 0,
  rule_hit_by_rule_id JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_error_total INTEGER NOT NULL DEFAULT 0,
  rag_no_result_total INTEGER NOT NULL DEFAULT 0,
  api_error_total INTEGER NOT NULL DEFAULT 0,
  p95_latency REAL NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_metrics_daily_date_idx
  ON audit_metrics_daily (metric_date);

CREATE INDEX IF NOT EXISTS audit_metrics_daily_rule_version_idx
  ON audit_metrics_daily (rule_version);

CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  metric_value REAL NOT NULL,
  threshold REAL NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alert_events_status_created_at_idx
  ON alert_events (status, created_at);

CREATE INDEX IF NOT EXISTS alert_events_metric_key_idx
  ON alert_events (metric_key);
