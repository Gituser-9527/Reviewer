CREATE TABLE IF NOT EXISTS beta_programs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  scope_redacted TEXT NOT NULL,
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS beta_programs_tenant_status_idx
  ON beta_programs (tenant_id, status);
CREATE INDEX IF NOT EXISTS beta_programs_mode_idx
  ON beta_programs (mode);
CREATE INDEX IF NOT EXISTS beta_programs_period_idx
  ON beta_programs (start_date, end_date);

CREATE TABLE IF NOT EXISTS beta_participants (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES beta_programs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  email_redacted TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS beta_participants_program_idx
  ON beta_participants (program_id);
CREATE INDEX IF NOT EXISTS beta_participants_tenant_role_idx
  ON beta_participants (tenant_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS beta_participants_program_user_idx
  ON beta_participants (program_id, user_id);

CREATE TABLE IF NOT EXISTS beta_feedback (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES beta_programs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title_redacted TEXT NOT NULL,
  description_redacted TEXT NOT NULL,
  related_audit_run_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS beta_feedback_program_status_idx
  ON beta_feedback (program_id, status);
CREATE INDEX IF NOT EXISTS beta_feedback_tenant_created_at_idx
  ON beta_feedback (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS beta_feedback_type_idx
  ON beta_feedback (feedback_type);

CREATE TABLE IF NOT EXISTS beta_daily_reports (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES beta_programs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  report_date TIMESTAMPTZ NOT NULL,
  active_participants INTEGER NOT NULL DEFAULT 0,
  audits_reviewed INTEGER NOT NULL DEFAULT 0,
  manual_reviews_completed INTEGER NOT NULL DEFAULT 0,
  feedback_opened INTEGER NOT NULL DEFAULT 0,
  feedback_resolved INTEGER NOT NULL DEFAULT 0,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_redacted TEXT NOT NULL,
  next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_daily_reports_program_date_idx
  ON beta_daily_reports (program_id, report_date);
CREATE INDEX IF NOT EXISTS beta_daily_reports_tenant_date_idx
  ON beta_daily_reports (tenant_id, report_date);

CREATE TABLE IF NOT EXISTS beta_go_no_go_checks (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES beta_programs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  check_key TEXT NOT NULL,
  title TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  owner_role TEXT NOT NULL,
  evidence_redacted TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_go_no_go_checks_program_key_idx
  ON beta_go_no_go_checks (program_id, check_key);
CREATE INDEX IF NOT EXISTS beta_go_no_go_checks_tenant_status_idx
  ON beta_go_no_go_checks (tenant_id, status);
