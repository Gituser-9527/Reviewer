CREATE TABLE IF NOT EXISTS tenant_level_modes (
  tenant_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_level_modes_mode_idx
  ON tenant_level_modes (mode);

CREATE TABLE IF NOT EXISTS beta_trial_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  agent_decision TEXT NOT NULL,
  agent_risk_level TEXT NOT NULL,
  human_decision TEXT,
  feedback_type TEXT,
  comparison_result TEXT,
  false_positive BOOLEAN NOT NULL DEFAULT false,
  false_negative BOOLEAN NOT NULL DEFAULT false,
  business_impact_applied BOOLEAN NOT NULL DEFAULT false,
  agent_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  agent_evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_trial_runs_audit_run_idx
  ON beta_trial_runs (audit_run_id);

CREATE INDEX IF NOT EXISTS beta_trial_runs_tenant_created_at_idx
  ON beta_trial_runs (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS beta_trial_runs_mode_idx
  ON beta_trial_runs (mode);

CREATE INDEX IF NOT EXISTS beta_trial_runs_comparison_idx
  ON beta_trial_runs (comparison_result);
