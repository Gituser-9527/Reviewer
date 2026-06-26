CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx
  ON users (email);

CREATE INDEX IF NOT EXISTS users_status_idx
  ON users (status);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_name_idx
  ON roles (name);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS permissions_name_idx
  ON permissions (name);

CREATE TABLE IF NOT EXISTS tenant_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_tenant_user_idx
  ON tenant_members (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS tenant_members_user_idx
  ON tenant_members (user_id);

CREATE INDEX IF NOT EXISTS tenant_members_tenant_role_idx
  ON tenant_members (tenant_id, role);

CREATE TABLE IF NOT EXISTS audit_operation_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  tenant_id TEXT,
  operation TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  before_payload JSONB,
  after_payload JSONB,
  request_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_operation_logs_actor_idx
  ON audit_operation_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS audit_operation_logs_tenant_created_at_idx
  ON audit_operation_logs (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS audit_operation_logs_operation_idx
  ON audit_operation_logs (operation);

CREATE TABLE IF NOT EXISTS rule_publish_approvals (
  id TEXT PRIMARY KEY,
  rule_set_id TEXT NOT NULL,
  rule_version TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  comment_redacted TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rule_publish_approvals_rule_set_idx
  ON rule_publish_approvals (rule_set_id);

CREATE INDEX IF NOT EXISTS rule_publish_approvals_status_idx
  ON rule_publish_approvals (status);
