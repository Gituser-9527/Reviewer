CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx
  ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS api_keys_tenant_status_idx
  ON api_keys (tenant_id, status);

CREATE INDEX IF NOT EXISTS api_keys_prefix_idx
  ON api_keys (key_prefix);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  api_key_id TEXT,
  resource_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  period TEXT NOT NULL,
  metadata JSONB,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_records_tenant_period_idx
  ON usage_records (tenant_id, period);

CREATE INDEX IF NOT EXISTS usage_records_api_key_idx
  ON usage_records (api_key_id);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_label TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_plans_status_idx
  ON subscription_plans (status);

CREATE TABLE IF NOT EXISTS tenant_billing_profiles (
  tenant_id TEXT PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL,
  used_quota INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  brand_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_billing_profiles_plan_idx
  ON tenant_billing_profiles (plan_id);

CREATE INDEX IF NOT EXISTS tenant_billing_profiles_status_idx
  ON tenant_billing_profiles (status);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_hash TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_delivery_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webhooks_tenant_status_idx
  ON webhooks (tenant_id, status);

CREATE INDEX IF NOT EXISTS webhooks_events_idx
  ON webhooks (tenant_id);

CREATE TABLE IF NOT EXISTS batch_audit_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  result_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS batch_audit_jobs_tenant_status_idx
  ON batch_audit_jobs (tenant_id, status);

CREATE INDEX IF NOT EXISTS batch_audit_jobs_created_at_idx
  ON batch_audit_jobs (created_at);

INSERT INTO subscription_plans (
  id,
  name,
  monthly_quota,
  features,
  price_label,
  status,
  payload
) VALUES
  (
    'free_trial',
    'Free Trial',
    100,
    '["API access","basic rules","CSV export"]'::jsonb,
    'Free',
    'active',
    '{"id":"free_trial","name":"Free Trial","monthlyQuota":100,"features":["API access","basic rules","CSV export"],"priceLabel":"Free","status":"active"}'::jsonb
  ),
  (
    'starter',
    'Starter',
    3000,
    '["API access","batch audit","webhook","CSV/PDF export"]'::jsonb,
    'Starter',
    'active',
    '{"id":"starter","name":"Starter","monthlyQuota":3000,"features":["API access","batch audit","webhook","CSV/PDF export"],"priceLabel":"Starter","status":"active"}'::jsonb
  ),
  (
    'pro',
    'Pro',
    30000,
    '["API access","batch audit","webhook","advanced reporting"]'::jsonb,
    'Pro',
    'active',
    '{"id":"pro","name":"Pro","monthlyQuota":30000,"features":["API access","batch audit","webhook","advanced reporting"],"priceLabel":"Pro","status":"active"}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    -1,
    '["private deployment","dedicated rules","SLA","custom integration"]'::jsonb,
    'Contact us',
    'active',
    '{"id":"enterprise","name":"Enterprise","monthlyQuota":-1,"features":["private deployment","dedicated rules","SLA","custom integration"],"priceLabel":"Contact us","status":"active"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
