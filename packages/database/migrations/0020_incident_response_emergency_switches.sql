CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title_redacted TEXT NOT NULL,
  description_redacted TEXT NOT NULL,
  related_audit_run_id TEXT,
  created_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS incident_events_tenant_status_idx
  ON incident_events (tenant_id, status);
CREATE INDEX IF NOT EXISTS incident_events_type_severity_idx
  ON incident_events (incident_type, severity);
CREATE INDEX IF NOT EXISTS incident_events_created_at_idx
  ON incident_events (created_at);

CREATE TABLE IF NOT EXISTS incident_actions (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incident_events(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  summary_redacted TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_actions_incident_idx
  ON incident_actions (incident_id);
CREATE INDEX IF NOT EXISTS incident_actions_action_type_idx
  ON incident_actions (action_type);

CREATE TABLE IF NOT EXISTS incident_postmortems (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incident_events(id) ON DELETE CASCADE,
  root_cause_redacted TEXT NOT NULL,
  impact_redacted TEXT NOT NULL,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  corrective_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  prevention_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS incident_postmortems_incident_idx
  ON incident_postmortems (incident_id);
CREATE INDEX IF NOT EXISTS incident_postmortems_created_at_idx
  ON incident_postmortems (created_at);

CREATE TABLE IF NOT EXISTS emergency_runtime_switches (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason_redacted TEXT,
  updated_by TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emergency_runtime_switches_enabled_idx
  ON emergency_runtime_switches (enabled);
CREATE INDEX IF NOT EXISTS emergency_runtime_switches_updated_at_idx
  ON emergency_runtime_switches (updated_at);
