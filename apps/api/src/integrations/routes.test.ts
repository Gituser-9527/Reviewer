import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import type { AuditJobRequest } from '../audit/schemas.js';
import type { RuntimeSelection } from '../runtime/services.js';
import { signWebhookPayload, verifyWebhookSignature } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function fakeAudit(
  input: JobPostingInput,
  request: AuditJobRequest,
  runtime?: RuntimeSelection,
): AuditResult {
  const now = '2026-06-26T00:00:00.000Z';
  return {
    auditId: `audit_${request.jobPostingId}`,
    decision: input.description.includes('服装费') ? 'REJECT' : 'PASS',
    riskLevel: input.description.includes('服装费') ? 'CRITICAL' : 'NONE',
    riskScore: input.description.includes('服装费') ? 95 : 0,
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

async function createTenantAndKey(app: ReturnType<typeof buildApp>) {
  await app.inject({
    method: 'POST',
    url: '/api/product/tenants',
    payload: {
      tenantId: 'tenant_v1',
      tenantName: 'V1 Tenant',
    },
  });
  const keyResponse = await app.inject({
    method: 'POST',
    url: '/api/product/tenants/tenant_v1/api-keys',
    payload: { name: 'V1 key' },
  });
  return keyResponse.json<{ apiKey: string }>().apiKey;
}

describe('external integration layer routes', () => {
  it('exposes OpenAPI, audits with API key, returns stable response and sends signed webhook tests', async () => {
    const app = buildApp({ auditJob: async (input, request, runtime) => fakeAudit(input, request, runtime) });
    apps.push(app);
    const apiKey = await createTenantAndKey(app);

    const openApi = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(openApi.statusCode).toBe(200);
    expect(openApi.json()).toMatchObject({
      openapi: '3.1.0',
      paths: expect.objectContaining({ '/v1/audit/job': expect.any(Object) }),
    });

    const endpointResponse = await app.inject({
      method: 'POST',
      url: '/v1/webhooks',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        url: 'mock://ats/audit-completed',
        events: ['audit.completed'],
        secret: 'sandbox_webhook_secret',
      },
    });
    expect(endpointResponse.statusCode).toBe(201);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/v1/audit/job',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        externalId: 'job_v1_001',
        company: { name: '某某科技有限公司' },
        job: {
          title: '行政专员',
          description: '入职需缴纳500元服装费。',
        },
        sandbox: true,
      },
    });
    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json()).toMatchObject({
      id: 'audit_job_v1_001',
      object: 'audit_run',
      status: 'completed',
      decision: 'REJECT',
      versions: {
        ruleVersion: '1.0.0',
      },
    });

    const webhookResponse = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/test',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        url: 'mock://ats/webhook',
        event: 'audit.completed',
        secret: 'sandbox_webhook_secret',
      },
    });
    expect(webhookResponse.statusCode).toBe(200);
    const webhook = webhookResponse.json<{
      signature: string;
      timestamp: string;
      payload: Record<string, unknown>;
    }>();
    const expectedSignature = signWebhookPayload({
      secret: 'sandbox_webhook_secret',
      timestamp: webhook.timestamp,
      payload: webhook.payload,
    });
    expect(webhook.signature).toBe(expectedSignature);
    expect(
      verifyWebhookSignature({
        secret: 'sandbox_webhook_secret',
        timestamp: webhook.timestamp,
        payload: webhook.payload,
        signature: webhook.signature,
      }),
    ).toBe(true);

    const deliveriesResponse = await app.inject({
      method: 'GET',
      url: '/v1/webhooks/deliveries',
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(deliveriesResponse.statusCode).toBe(200);
    expect(deliveriesResponse.json<{ items: Array<{ event: string; signature: string }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'audit.completed', signature: expect.any(String) }),
      ]),
    );

    const usage = await app.inject({
      method: 'GET',
      url: '/v1/usage',
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(usage.statusCode).toBe(200);
    expect(usage.json()).toMatchObject({
      object: 'usage',
      quota: {
        tenant: { usedQuota: 1 },
      },
    });
  });

  it('accepts JSONL batch imports and exposes batch status', async () => {
    const app = buildApp({ auditJob: async (input, request, runtime) => fakeAudit(input, request, runtime) });
    apps.push(app);
    const apiKey = await createTenantAndKey(app);
    const jsonl = [
      JSON.stringify({
        externalId: 'jsonl_001',
        company: { name: '某某科技有限公司' },
        job: { title: '客服', description: '岗位职责清晰。' },
      }),
      JSON.stringify({
        externalId: 'jsonl_002',
        company: { name: '某某科技有限公司' },
        job: { title: '行政', description: '入职需缴纳服装费。' },
      }),
    ].join('\n');

    const batchResponse = await app.inject({
      method: 'POST',
      url: '/v1/audit/batch',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { jsonl, sandbox: true },
    });
    expect(batchResponse.statusCode).toBe(202);
    expect(batchResponse.json()).toMatchObject({
      object: 'batch_audit_job',
      totalCount: 2,
    });

    for (let index = 0; index < 30; index += 1) {
      const status = await app.inject({
        method: 'GET',
        url: `/v1/audit/batch/${batchResponse.json<{ id: string }>().id}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(status.statusCode).toBe(200);
      const body = status.json<{ status: string; completedCount: number }>();
      if (body.status === 'completed') {
        expect(body.completedCount).toBe(2);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Batch did not complete.');
  });
});
