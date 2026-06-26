import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuditResult } from '@job-compliance/shared';
import type { ProductService } from '../product/service.js';

export type IntegrationEnvironment = 'production' | 'sandbox';
export type WebhookDeliveryStatus = 'success' | 'failed' | 'skipped';

export interface IntegrationClient {
  id: string;
  tenantId: string;
  name: string;
  environment: IntegrationEnvironment;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface IntegrationWebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  secret: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationWebhookDeliveryLog {
  id: string;
  tenantId: string;
  endpointId: string;
  event: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  error?: string;
  signature: string;
  createdAt: string;
}

export interface SandboxAuditRun {
  id: string;
  tenantId: string;
  auditRunId: string;
  input: Record<string, unknown>;
  result: AuditResult;
  createdAt: string;
}

export interface StableAuditResponse {
  id: string;
  object: 'audit_run';
  status: 'completed';
  decision: AuditResult['decision'];
  riskLevel: AuditResult['riskLevel'];
  riskScore: number;
  summary: string;
  findings: AuditResult['findings'];
  evidence: AuditResult['evidence'];
  suggestions: AuditResult['suggestions'];
  rewrittenPosting?: string | null;
  versions: {
    ruleVersion: string;
    lawKbVersion: string;
    modelVersion?: string;
  };
  createdAt: string;
}

export interface StableBatchResponse {
  id: string;
  object: 'batch_audit_job';
  status: string;
  totalCount: number;
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  resultIds: string[];
  errors: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: string;
  payload: unknown;
}): string {
  const signedPayload = `${input.timestamp}.${stableJson(input.payload)}`;
  return createHmac('sha256', input.secret).update(signedPayload).digest('hex');
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  payload: unknown;
  signature: string;
}): boolean {
  const expected = signWebhookPayload(input);
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(input.signature, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function riskScoreOf(riskLevel: AuditResult['riskLevel']): number {
  if (riskLevel === 'CRITICAL') return 95;
  if (riskLevel === 'HIGH') return 80;
  if (riskLevel === 'MEDIUM') return 50;
  if (riskLevel === 'LOW') return 20;
  return 0;
}

export function toStableAuditResponse(result: AuditResult): StableAuditResponse {
  return {
    id: result.auditId,
    object: 'audit_run',
    status: 'completed',
    decision: result.decision,
    riskLevel: result.riskLevel,
    riskScore: riskScoreOf(result.riskLevel),
    summary: result.summary,
    findings: result.findings,
    evidence: result.evidence,
    suggestions: result.suggestions,
    rewrittenPosting: result.compliantRewrite,
    versions: {
      ruleVersion: result.context.ruleVersion,
      lawKbVersion: result.context.lawKbVersion,
      ...(result.context.modelVersion === undefined ? {} : { modelVersion: result.context.modelVersion }),
    },
    createdAt: result.createdAt,
  };
}

export class IntegrationService {
  private readonly clients = new Map<string, IntegrationClient>();
  private readonly webhooks = new Map<string, IntegrationWebhookEndpoint>();
  private readonly deliveries = new Map<string, IntegrationWebhookDeliveryLog>();
  private readonly sandboxRuns = new Map<string, SandboxAuditRun>();

  constructor(private readonly productService: ProductService) {}

  authenticate(headers: Record<string, unknown>): {
    tenantId: string;
    apiKeyId: string;
    environment: IntegrationEnvironment;
  } {
    const apiKey = this.productService.extractApiKey(headers);
    if (apiKey === undefined) {
      throw new IntegrationApiError(401, 'UNAUTHENTICATED', 'API key is required.');
    }
    const context = this.productService.authenticateApiKey(apiKey);
    const environment: IntegrationEnvironment = apiKey.startsWith('jca_sandbox_')
      ? 'sandbox'
      : 'production';
    this.ensureClient(context.tenantId, environment);
    return {
      tenantId: context.tenantId,
      apiKeyId: context.apiKeyId,
      environment,
    };
  }

  createWebhookEndpoint(input: {
    tenantId: string;
    url: string;
    events: string[];
    secret?: string;
  }): IntegrationWebhookEndpoint {
    const timestamp = nowIso();
    const endpoint: IntegrationWebhookEndpoint = {
      id: `wh_${randomUUID()}`,
      tenantId: input.tenantId,
      url: input.url,
      events: input.events,
      secret: input.secret ?? `whsec_${randomUUID()}`,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.webhooks.set(endpoint.id, structuredClone(endpoint));
    return structuredClone(endpoint);
  }

  listWebhookEndpoints(tenantId: string): IntegrationWebhookEndpoint[] {
    return [...this.webhooks.values()]
      .filter((endpoint) => endpoint.tenantId === tenantId)
      .map((endpoint) => structuredClone(endpoint));
  }

  async dispatchWebhook(input: {
    tenantId: string;
    event: string;
    payload: unknown;
  }): Promise<IntegrationWebhookDeliveryLog[]> {
    const endpoints = [...this.webhooks.values()].filter(
      (endpoint) =>
        endpoint.tenantId === input.tenantId &&
        endpoint.status === 'active' &&
        endpoint.events.includes(input.event),
    );
    const logs: IntegrationWebhookDeliveryLog[] = [];
    for (const endpoint of endpoints) {
      logs.push(...(await this.deliverWithRetry(endpoint, input.event, input.payload)));
    }
    return logs;
  }

  async testWebhook(input: {
    tenantId: string;
    url?: string;
    event?: string;
    secret?: string;
  }): Promise<{
    event: string;
    signature: string;
    timestamp: string;
    payload: Record<string, unknown>;
    deliveries: IntegrationWebhookDeliveryLog[];
  }> {
    const payload = {
      id: `evt_${randomUUID()}`,
      object: 'event',
      type: input.event ?? 'audit.completed',
      data: {
        id: 'audit_sandbox_example',
        decision: 'PASS',
      },
      createdAt: nowIso(),
    };
    const timestamp = nowIso();
    const secret = input.secret ?? 'sandbox_webhook_secret';
    const signature = signWebhookPayload({ secret, timestamp, payload });
    const deliveries =
      input.url === undefined
        ? []
        : await this.deliverWithRetry(
            {
              id: `wh_test_${randomUUID()}`,
              tenantId: input.tenantId,
              url: input.url,
              events: [input.event ?? 'audit.completed'],
              secret,
              status: 'active',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            input.event ?? 'audit.completed',
            payload,
          );
    return {
      event: input.event ?? 'audit.completed',
      signature,
      timestamp,
      payload,
      deliveries,
    };
  }

  recordSandboxRun(input: {
    tenantId: string;
    auditRunId: string;
    input: Record<string, unknown>;
    result: AuditResult;
  }): SandboxAuditRun {
    const record: SandboxAuditRun = {
      id: `sandbox_run_${randomUUID()}`,
      tenantId: input.tenantId,
      auditRunId: input.auditRunId,
      input: input.input,
      result: input.result,
      createdAt: nowIso(),
    };
    this.sandboxRuns.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  listSandboxRuns(tenantId: string): SandboxAuditRun[] {
    return [...this.sandboxRuns.values()]
      .filter((run) => run.tenantId === tenantId)
      .map((run) => structuredClone(run));
  }

  listDeliveryLogs(tenantId: string): IntegrationWebhookDeliveryLog[] {
    return [...this.deliveries.values()]
      .filter((log) => log.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((log) => structuredClone(log));
  }

  private ensureClient(tenantId: string, environment: IntegrationEnvironment): IntegrationClient {
    const existing = [...this.clients.values()].find(
      (client) => client.tenantId === tenantId && client.environment === environment,
    );
    if (existing !== undefined) return existing;
    const client: IntegrationClient = {
      id: `integration_client_${randomUUID()}`,
      tenantId,
      name: `${tenantId} ${environment}`,
      environment,
      status: 'active',
      createdAt: nowIso(),
    };
    this.clients.set(client.id, structuredClone(client));
    return client;
  }

  private async deliverWithRetry(
    endpoint: IntegrationWebhookEndpoint,
    event: string,
    payload: unknown,
  ): Promise<IntegrationWebhookDeliveryLog[]> {
    const logs: IntegrationWebhookDeliveryLog[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const timestamp = nowIso();
      const signature = signWebhookPayload({ secret: endpoint.secret, timestamp, payload });
      const log = await this.deliverOnce(endpoint, event, payload, attempt, timestamp, signature);
      logs.push(log);
      this.deliveries.set(log.id, structuredClone(log));
      if (log.status === 'success' || endpoint.url.startsWith('mock://')) break;
    }
    return logs.map((log) => structuredClone(log));
  }

  private async deliverOnce(
    endpoint: IntegrationWebhookEndpoint,
    event: string,
    payload: unknown,
    attempt: number,
    timestamp: string,
    signature: string,
  ): Promise<IntegrationWebhookDeliveryLog> {
    if (endpoint.url.startsWith('mock://')) {
      return {
        id: `whlog_${randomUUID()}`,
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        event,
        attempt,
        status: 'success',
        statusCode: 200,
        signature,
        createdAt: timestamp,
      };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-jca-event': event,
          'x-jca-timestamp': timestamp,
          'x-jca-signature': signature,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return {
        id: `whlog_${randomUUID()}`,
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        event,
        attempt,
        status: response.ok ? 'success' : 'failed',
        statusCode: response.status,
        signature,
        createdAt: timestamp,
      };
    } catch (error) {
      return {
        id: `whlog_${randomUUID()}`,
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        event,
        attempt,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Webhook delivery failed.',
        signature,
        createdAt: timestamp,
      };
    }
  }
}

export class IntegrationApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationApiError';
  }
}
