import { randomBytes, randomUUID } from 'node:crypto';
import { hashSensitiveValue } from '@job-compliance/core';
import { redactJson, redactSensitiveText } from '@job-compliance/database';
import type { CreateApiKeyInput, CreateTenantInput, CreateWebhookInput } from './schemas.js';

export interface SubscriptionPlanRecord {
  id: string;
  name: string;
  monthlyQuota: number;
  features: string[];
  priceLabel: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface TenantBillingProfileRecord {
  tenantId: string;
  tenantName: string;
  planId: string;
  monthlyQuota: number;
  usedQuota: number;
  period: string;
  brandConfig: Record<string, unknown>;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface CreatedApiKeyRecord extends Omit<ApiKeyRecord, 'keyHash'> {
  apiKey: string;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  apiKeyId?: string;
  resourceType: 'audit';
  quantity: number;
  period: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WebhookRecord {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  secretHash?: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt?: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  tenantId: string;
  webhookId: string;
  event: string;
  status: 'success' | 'failed' | 'skipped';
  statusCode?: number;
  error?: string;
  createdAt: string;
}

export interface BatchAuditJobRecord {
  id: string;
  tenantId: string;
  status: 'processing' | 'completed' | 'failed';
  totalCount: number;
  completedCount: number;
  failedCount: number;
  resultIds: string[];
  errors: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyAuthContext {
  apiKeyId: string;
  tenantId: string;
  keyPrefix: string;
}

export class ProductApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProductApiError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const defaultPlans: SubscriptionPlanRecord[] = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    monthlyQuota: 100,
    features: ['API access', 'basic rules', 'CSV export'],
    priceLabel: 'Free',
    status: 'active',
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyQuota: 3_000,
    features: ['API access', 'batch audit', 'webhook', 'CSV/PDF export'],
    priceLabel: 'Starter',
    status: 'active',
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyQuota: 30_000,
    features: ['API access', 'batch audit', 'webhook', 'advanced reporting'],
    priceLabel: 'Pro',
    status: 'active',
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyQuota: -1,
    features: ['private deployment', 'dedicated rules', 'SLA', 'custom integration'],
    priceLabel: 'Contact us',
    status: 'active',
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  },
];

function publicApiKey(record: ApiKeyRecord): Omit<ApiKeyRecord, 'keyHash'> {
  const { keyHash: _keyHash, ...publicRecord } = record;
  return publicRecord;
}

export class ProductService {
  private readonly plans = new Map<string, SubscriptionPlanRecord>();
  private readonly tenants = new Map<string, TenantBillingProfileRecord>();
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly usageRecords = new Map<string, UsageRecord>();
  private readonly webhooks = new Map<string, WebhookRecord>();
  private readonly deliveries = new Map<string, WebhookDeliveryRecord>();
  private readonly batches = new Map<string, BatchAuditJobRecord>();

  constructor() {
    for (const plan of defaultPlans) {
      this.plans.set(plan.id, structuredClone(plan));
    }
  }

  listPlans(): SubscriptionPlanRecord[] {
    return [...this.plans.values()].map((plan) => structuredClone(plan));
  }

  createTenant(input: CreateTenantInput): TenantBillingProfileRecord {
    const plan = this.plans.get(input.planId);
    if (plan === undefined) {
      throw new ProductApiError(400, 'PLAN_NOT_FOUND', 'Subscription plan was not found.');
    }
    const timestamp = nowIso();
    const tenantId = input.tenantId ?? `tenant_${randomUUID()}`;
    const record: TenantBillingProfileRecord = {
      tenantId,
      tenantName: redactSensitiveText(input.tenantName),
      planId: plan.id,
      monthlyQuota: plan.monthlyQuota,
      usedQuota: 0,
      period: currentPeriod(),
      brandConfig: redactJson(input.brandConfig),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.tenants.set(tenantId, structuredClone(record));
    return structuredClone(record);
  }

  getTenant(tenantId: string): TenantBillingProfileRecord | undefined {
    const tenant = this.tenants.get(tenantId);
    return tenant === undefined ? undefined : structuredClone(tenant);
  }

  updateBrand(tenantId: string, brandConfig: Record<string, unknown>): TenantBillingProfileRecord | undefined {
    const tenant = this.tenants.get(tenantId);
    if (tenant === undefined) return undefined;
    const updated: TenantBillingProfileRecord = {
      ...tenant,
      brandConfig: redactJson({ ...tenant.brandConfig, ...brandConfig }),
      updatedAt: nowIso(),
    };
    this.tenants.set(tenantId, structuredClone(updated));
    return structuredClone(updated);
  }

  createApiKey(tenantId: string, input: CreateApiKeyInput): CreatedApiKeyRecord {
    this.requireTenant(tenantId);
    const timestamp = nowIso();
    const secret = randomBytes(24).toString('base64url');
    const keyPrefix = randomBytes(4).toString('hex');
    const apiKey = `jca_${keyPrefix}_${secret}`;
    const record: ApiKeyRecord = {
      id: `api_key_${randomUUID()}`,
      tenantId,
      name: redactSensitiveText(input.name),
      keyHash: hashSensitiveValue(apiKey),
      keyPrefix,
      status: 'active',
      createdAt: timestamp,
    };
    this.apiKeys.set(record.id, structuredClone(record));
    return {
      ...publicApiKey(record),
      apiKey,
    };
  }

  listApiKeys(tenantId: string): Array<Omit<ApiKeyRecord, 'keyHash'>> {
    return [...this.apiKeys.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => structuredClone(publicApiKey(record)));
  }

  revokeApiKey(id: string): Omit<ApiKeyRecord, 'keyHash'> | undefined {
    const record = this.apiKeys.get(id);
    if (record === undefined) return undefined;
    const updated: ApiKeyRecord = {
      ...record,
      status: 'revoked',
      revokedAt: nowIso(),
    };
    this.apiKeys.set(id, structuredClone(updated));
    return structuredClone(publicApiKey(updated));
  }

  authenticateApiKey(apiKey: string): ApiKeyAuthContext {
    const keyHash = hashSensitiveValue(apiKey);
    const record = [...this.apiKeys.values()].find((entry) => entry.keyHash === keyHash);
    if (record === undefined || record.status !== 'active') {
      throw new ProductApiError(401, 'INVALID_API_KEY', 'API key is invalid or revoked.');
    }
    const updated: ApiKeyRecord = {
      ...record,
      lastUsedAt: nowIso(),
    };
    this.apiKeys.set(record.id, structuredClone(updated));
    return {
      apiKeyId: record.id,
      tenantId: record.tenantId,
      keyPrefix: record.keyPrefix,
    };
  }

  assertQuota(tenantId: string, quantity: number): void {
    const tenant = this.requireTenant(tenantId);
    const normalized = this.rollPeriodIfNeeded(tenant);
    if (normalized.monthlyQuota >= 0 && normalized.usedQuota + quantity > normalized.monthlyQuota) {
      throw new ProductApiError(402, 'QUOTA_EXCEEDED', 'Monthly audit quota is exhausted.');
    }
  }

  recordUsage(input: {
    tenantId: string;
    quantity: number;
    apiKeyId?: string;
    metadata?: Record<string, unknown>;
  }): UsageRecord {
    const tenant = this.rollPeriodIfNeeded(this.requireTenant(input.tenantId));
    const timestamp = nowIso();
    const updatedTenant: TenantBillingProfileRecord = {
      ...tenant,
      usedQuota: tenant.usedQuota + input.quantity,
      updatedAt: timestamp,
    };
    this.tenants.set(tenant.tenantId, structuredClone(updatedTenant));
    const record: UsageRecord = {
      id: `usage_${randomUUID()}`,
      tenantId: input.tenantId,
      ...(input.apiKeyId === undefined ? {} : { apiKeyId: input.apiKeyId }),
      resourceType: 'audit',
      quantity: input.quantity,
      period: updatedTenant.period,
      ...(input.metadata === undefined ? {} : { metadata: redactJson(input.metadata) }),
      createdAt: timestamp,
    };
    this.usageRecords.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  getUsage(tenantId: string): {
    tenant: TenantBillingProfileRecord;
    records: UsageRecord[];
    remainingQuota: number | 'unlimited';
  } {
    const tenant = this.rollPeriodIfNeeded(this.requireTenant(tenantId));
    const records = [...this.usageRecords.values()]
      .filter((record) => record.tenantId === tenantId && record.period === tenant.period)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => structuredClone(record));
    return {
      tenant: structuredClone(tenant),
      records,
      remainingQuota:
        tenant.monthlyQuota < 0 ? 'unlimited' : Math.max(0, tenant.monthlyQuota - tenant.usedQuota),
    };
  }

  createWebhook(tenantId: string, input: CreateWebhookInput): WebhookRecord {
    this.requireTenant(tenantId);
    const timestamp = nowIso();
    const record: WebhookRecord = {
      id: `webhook_${randomUUID()}`,
      tenantId,
      url: input.url,
      events: input.events,
      ...(input.secret === undefined ? {} : { secretHash: hashSensitiveValue(input.secret) }),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.webhooks.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listWebhooks(tenantId: string): WebhookRecord[] {
    return [...this.webhooks.values()]
      .filter((webhook) => webhook.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((webhook) => structuredClone(webhook));
  }

  async notifyWebhooks(tenantId: string, event: 'audit.completed' | 'batch.completed', payload: unknown): Promise<WebhookDeliveryRecord[]> {
    const hooks = [...this.webhooks.values()].filter(
      (hook) => hook.tenantId === tenantId && hook.status === 'active' && hook.events.includes(event),
    );
    const deliveries: WebhookDeliveryRecord[] = [];
    for (const hook of hooks) {
      const delivery = await this.deliverWebhook(hook, event, payload);
      deliveries.push(delivery);
    }
    return deliveries;
  }

  listWebhookDeliveries(tenantId: string): WebhookDeliveryRecord[] {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((delivery) => structuredClone(delivery));
  }

  createBatch(tenantId: string, totalCount: number): BatchAuditJobRecord {
    this.requireTenant(tenantId);
    const timestamp = nowIso();
    const record: BatchAuditJobRecord = {
      id: `batch_${randomUUID()}`,
      tenantId,
      status: 'processing',
      totalCount,
      completedCount: 0,
      failedCount: 0,
      resultIds: [],
      errors: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.batches.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  completeBatch(id: string, input: { resultIds: string[]; errors: Record<string, unknown>[] }): BatchAuditJobRecord | undefined {
    const record = this.batches.get(id);
    if (record === undefined) return undefined;
    const updated: BatchAuditJobRecord = {
      ...record,
      status: input.errors.length > 0 ? 'failed' : 'completed',
      completedCount: input.resultIds.length,
      failedCount: input.errors.length,
      resultIds: input.resultIds,
      errors: redactJson(input.errors),
      updatedAt: nowIso(),
    };
    this.batches.set(id, structuredClone(updated));
    return structuredClone(updated);
  }

  findBatch(id: string): BatchAuditJobRecord | undefined {
    const record = this.batches.get(id);
    return record === undefined ? undefined : structuredClone(record);
  }

  extractApiKey(headers: Record<string, unknown>): string | undefined {
    const xApiKey = headers['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.trim().length > 0) return xApiKey.trim();
    const authorization = headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }
    return undefined;
  }

  private requireTenant(tenantId: string): TenantBillingProfileRecord {
    const tenant = this.tenants.get(tenantId);
    if (tenant === undefined || tenant.status !== 'active') {
      throw new ProductApiError(404, 'TENANT_NOT_FOUND', 'Tenant was not found or is inactive.');
    }
    return tenant;
  }

  private rollPeriodIfNeeded(tenant: TenantBillingProfileRecord): TenantBillingProfileRecord {
    const period = currentPeriod();
    if (tenant.period === period) return tenant;
    const updated: TenantBillingProfileRecord = {
      ...tenant,
      usedQuota: 0,
      period,
      updatedAt: nowIso(),
    };
    this.tenants.set(tenant.tenantId, structuredClone(updated));
    return updated;
  }

  private async deliverWebhook(
    hook: WebhookRecord,
    event: string,
    payload: unknown,
  ): Promise<WebhookDeliveryRecord> {
    const timestamp = nowIso();
    let delivery: WebhookDeliveryRecord;
    if (hook.url.startsWith('mock://')) {
      delivery = {
        id: `webhook_delivery_${randomUUID()}`,
        tenantId: hook.tenantId,
        webhookId: hook.id,
        event,
        status: 'success',
        statusCode: 200,
        createdAt: timestamp,
      };
    } else {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3_000);
        const response = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-job-compliance-event': event,
          },
          body: JSON.stringify(redactJson(payload)),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        delivery = {
          id: `webhook_delivery_${randomUUID()}`,
          tenantId: hook.tenantId,
          webhookId: hook.id,
          event,
          status: response.ok ? 'success' : 'failed',
          statusCode: response.status,
          createdAt: timestamp,
        };
      } catch (error) {
        delivery = {
          id: `webhook_delivery_${randomUUID()}`,
          tenantId: hook.tenantId,
          webhookId: hook.id,
          event,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Webhook delivery failed.',
          createdAt: timestamp,
        };
      }
    }
    this.deliveries.set(delivery.id, structuredClone(delivery));
    this.webhooks.set(hook.id, {
      ...hook,
      lastDeliveryAt: timestamp,
      updatedAt: timestamp,
    });
    return structuredClone(delivery);
  }
}
