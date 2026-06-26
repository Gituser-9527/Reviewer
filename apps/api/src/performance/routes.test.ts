import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import type { AuditJobRequest } from '../audit/schemas.js';
import type { RuntimeSelection } from '../runtime/services.js';
import { createPerformanceServices, FallbackPolicyService } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function auditPayload(tenantId = 'tenant_perf') {
  return {
    tenantId,
    jobPostingId: 'job_perf_001',
    company: { name: '某某科技有限公司' },
    job: {
      title: '行政专员',
      description: '限女性，入职需缴纳500元服装费。',
    },
    options: {
      jurisdiction: 'CN_MAINLAND',
      enableRewrite: false,
      enableRag: false,
    },
  };
}

function fakeResult(
  input: JobPostingInput,
  request: AuditJobRequest,
  runtime?: RuntimeSelection,
): AuditResult {
  const now = '2026-06-26T00:00:00.000Z';
  return {
    auditId: `audit_${request.jobPostingId}`,
    decision: input.description.includes('服装费') ? 'REJECT' : 'PASS',
    riskLevel: input.description.includes('服装费') ? 'CRITICAL' : 'NONE',
    summary: input.description.includes('服装费') ? '存在收费风险。' : '未发现明显风险。',
    findings: [],
    evidence: [],
    suggestions: [],
    compliantRewrite: null,
    context: {
      auditId: `audit_${request.jobPostingId}`,
      tenantId: request.tenantId,
      requestId: `request_${request.jobPostingId}`,
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: runtime?.ruleVersion ?? '1.0.0',
      lawKbVersion: runtime?.lawKbVersion ?? 'local-test',
      modelVersion: runtime?.modelVersion ?? 'mock-none',
      evaluatedAt: now,
    },
    checkerResults: [],
    createdAt: now,
  };
}

async function waitForBatch(
  app: ReturnType<typeof buildApp>,
  batchId: string,
): Promise<Record<string, unknown>> {
  for (let index = 0; index < 30; index += 1) {
    const response = await app.inject({ method: 'GET', url: `/api/audit/batch/${batchId}` });
    const batch = response.json<Record<string, unknown>>();
    if (batch.status === 'completed' || batch.status === 'partial_failed' || batch.status === 'failed') {
      return batch;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Batch did not complete in time.');
}

describe('performance, cost and async queue routes', () => {
  it('accepts batch audit asynchronously and exposes progress, items, cost and limits', async () => {
    const app = buildApp({ auditJob: async (input, request, runtime) => fakeResult(input, request, runtime) });
    apps.push(app);

    await app.inject({
      method: 'POST',
      url: '/api/product/tenants',
      payload: {
        tenantId: 'tenant_perf',
        tenantName: 'Performance Tenant',
      },
    });

    const limitUpdate = await app.inject({
      method: 'PATCH',
      url: '/api/usage/limits/tenant_perf',
      payload: {
        tenantDailyAuditLimit: 10,
        tenantPerMinuteLimit: 10,
        apiKeyPerMinuteLimit: 10,
      },
    });
    expect(limitUpdate.statusCode).toBe(200);

    const batchResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/batch',
      payload: {
        tenantId: 'tenant_perf',
        jobs: [
          {
            jobPostingId: 'batch_perf_001',
            company: { name: '某某科技有限公司' },
            job: { title: '客服', description: '岗位职责清晰。' },
            options: { jurisdiction: 'CN_MAINLAND', enableRag: false },
          },
          {
            jobPostingId: 'batch_perf_002',
            company: { name: '某某科技有限公司' },
            job: { title: '行政', description: '入职需缴纳500元服装费。' },
            options: { jurisdiction: 'CN_MAINLAND', enableRag: false },
          },
        ],
      },
    });
    expect(batchResponse.statusCode).toBe(202);
    expect(batchResponse.json()).toMatchObject({
      tenantId: 'tenant_perf',
      totalCount: 2,
    });
    const batchId = batchResponse.json<{ id: string }>().id;
    const completed = await waitForBatch(app, batchId);
    expect(completed).toMatchObject({
      status: 'completed',
      completedCount: 2,
      failedCount: 0,
    });

    const itemsResponse = await app.inject({
      method: 'GET',
      url: `/api/audit/batch/${batchId}/items`,
    });
    expect(itemsResponse.statusCode).toBe(200);
    expect(itemsResponse.json<{ items: Array<{ status: string }> }>().items).toHaveLength(2);
    expect(itemsResponse.json<{ items: Array<{ status: string }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'completed' })]),
    );

    const costsResponse = await app.inject({
      method: 'GET',
      url: '/api/usage/costs?tenantId=tenant_perf',
    });
    expect(costsResponse.statusCode).toBe(200);
    expect(costsResponse.json()).toMatchObject({
      tenantId: 'tenant_perf',
      daily: [expect.objectContaining({ auditCount: 2 })],
    });

    const limitsResponse = await app.inject({
      method: 'GET',
      url: '/api/usage/limits?tenantId=tenant_perf',
    });
    expect(limitsResponse.statusCode).toBe(200);
    expect(limitsResponse.json()).toMatchObject({
      tenantId: 'tenant_perf',
      tenantDailyUsed: 2,
      remainingDaily: 8,
    });
  });

  it('falls back to deterministic audit when the primary single-audit handler times out', async () => {
    const performanceServices = createPerformanceServices();
    performanceServices.fallbackPolicyService = new FallbackPolicyService({
      auditTimeoutMs: 5,
      llmTimeoutMs: 5,
      ragNoResultFallbackDecision: 'continue',
    });
    const app = buildApp({
      performanceServices,
      auditJob: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('slow LLM checker should not fail the audit');
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditPayload('tenant_timeout'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<AuditResult>()).toMatchObject({
      decision: 'REJECT',
      riskLevel: 'CRITICAL',
    });
  });

  it('enforces tenant rate limits', async () => {
    const performanceServices = createPerformanceServices();
    performanceServices.rateLimitService.configureTenant('tenant_limited', {
      tenantDailyAuditLimit: 1,
      tenantPerMinuteLimit: 1,
      apiKeyPerMinuteLimit: 1,
    });
    const app = buildApp({
      performanceServices,
      auditJob: async (input, request, runtime) => fakeResult(input, request, runtime),
    });
    apps.push(app);

    const first = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditPayload('tenant_limited'),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: { ...auditPayload('tenant_limited'), jobPostingId: 'job_limited_002' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
  });
});
