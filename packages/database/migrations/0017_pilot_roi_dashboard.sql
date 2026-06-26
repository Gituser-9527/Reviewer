CREATE TABLE IF NOT EXISTS pilot_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  modes JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  avg_review_time_before REAL NOT NULL,
  avg_review_time_after REAL NOT NULL,
  hourly_labor_cost REAL NOT NULL,
  description_redacted TEXT,
  created_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pilot_projects_tenant_status_idx
  ON pilot_projects (tenant_id, status);
CREATE INDEX IF NOT EXISTS pilot_projects_period_idx
  ON pilot_projects (start_date, end_date);

CREATE TABLE IF NOT EXISTS pilot_daily_metrics (
  id TEXT PRIMARY KEY,
  pilot_project_id TEXT NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  metric_date TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL,
  total_jobs_audited INTEGER NOT NULL DEFAULT 0,
  auto_pass_rate REAL NOT NULL DEFAULT 0,
  auto_reject_rate REAL NOT NULL DEFAULT 0,
  manual_review_rate REAL NOT NULL DEFAULT 0,
  avg_review_time_before REAL NOT NULL DEFAULT 0,
  avg_review_time_after REAL NOT NULL DEFAULT 0,
  time_saved_hours REAL NOT NULL DEFAULT 0,
  estimated_labor_cost_saved REAL NOT NULL DEFAULT 0,
  false_positive_rate REAL NOT NULL DEFAULT 0,
  false_negative_rate REAL NOT NULL DEFAULT 0,
  appeal_rate REAL NOT NULL DEFAULT 0,
  customer_satisfaction REAL NOT NULL DEFAULT 0,
  top_risk_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_rule_hits JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pilot_daily_metrics_project_date_mode_idx
  ON pilot_daily_metrics (pilot_project_id, metric_date, mode);
CREATE INDEX IF NOT EXISTS pilot_daily_metrics_tenant_date_idx
  ON pilot_daily_metrics (tenant_id, metric_date);

CREATE TABLE IF NOT EXISTS roi_reports (
  id TEXT PRIMARY KEY,
  pilot_project_id TEXT NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  report_period_start TIMESTAMPTZ NOT NULL,
  report_period_end TIMESTAMPTZ NOT NULL,
  total_jobs_audited INTEGER NOT NULL DEFAULT 0,
  time_saved_hours REAL NOT NULL DEFAULT 0,
  estimated_labor_cost_saved REAL NOT NULL DEFAULT 0,
  false_positive_rate REAL NOT NULL DEFAULT 0,
  false_negative_rate REAL NOT NULL DEFAULT 0,
  appeal_rate REAL NOT NULL DEFAULT 0,
  customer_satisfaction REAL NOT NULL DEFAULT 0,
  risks_and_limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  markdown_redacted TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roi_reports_project_created_at_idx
  ON roi_reports (pilot_project_id, created_at);
CREATE INDEX IF NOT EXISTS roi_reports_tenant_idx
  ON roi_reports (tenant_id);

CREATE TABLE IF NOT EXISTS customer_feedback (
  id TEXT PRIMARY KEY,
  pilot_project_id TEXT NOT NULL REFERENCES pilot_projects(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  rating REAL,
  contact_name_redacted TEXT,
  comment_redacted TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_feedback_project_idx
  ON customer_feedback (pilot_project_id);
CREATE INDEX IF NOT EXISTS customer_feedback_tenant_created_at_idx
  ON customer_feedback (tenant_id, created_at);
