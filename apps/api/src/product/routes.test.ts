import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const auditPayload = {
  tenantId: 'tenant_saas',
  jobPostingId: 'job_saas_001',
  company: { name: '某某科技有限公司' },
  job: {
    title: '行政专员',
    description: '招聘行政专员，限女性，入职需缴纳500元服装费。',
    location: '北京',
    salary: '8k-15k',
    employmentType: 'full_time',
  },
  options: {
    jurisdiction: 'CN_MAINLAND',
    enableRewrite: false,
    enableRag: true,
  },
} as const;

async function waitForBatch(
  app: ReturnType<typeof buildApp>,
  batchId: string,
): Promise<Record<string, unknown>> {
  for (let index = 0; index < 50; index += 1) {
    const response = await app.inject({ method: 'GET', url: `/api/audit/batch/${batchId}` });
    const batch = response.json<Record<string, unknown>>();
    if (batch.status === 'completed' || batch.status === 'partial_failed' || batch.status === 'failed') {
      return batch;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Batch did not complete in time.');
}

describe('productization SaaS/API routes', () => {
  it('creates tenant and API key, meters API calls, supports webhook, batch audit and exports', async () => {
    const app = buildApp();
    apps.push(app);

    const plansResponse = await app.inject({
      method: 'GET',
      url: '/api/product/plans',
    });
    expect(plansResponse.statusCode).toBe(200);
    expect(plansResponse.json<{ items: unknown[] }>().items).toHaveLength(4);

    const tenantResponse = await app.inject({
      method: 'POST',
      url: '/api/product/tenants',
      payload: {
        tenantId: 'tenant_saas',
        tenantName: 'SaaS Test Tenant',
        planId: 'free_trial',
        brandConfig: {
          displayName: '合规审核试用版',
          primaryColor: '#0f766e',
          supportEmail: 'support@example.com',
        },
      },
    });
    expect(tenantResponse.statusCode).toBe(201);
    expect(tenantResponse.json()).toMatchObject({
      tenantId: 'tenant_saas',
      planId: 'free_trial',
      monthlyQuota: 100,
      usedQuota: 0,
    });

    const keyResponse = await app.inject({
      method: 'POST',
      url: '/api/product/tenants/tenant_saas/api-keys',
      payload: {
        name: 'Default integration key',
      },
    });
    expect(keyResponse.statusCode).toBe(201);
    const apiKeyRecord = keyResponse.json<{ apiKey: string; keyHash?: string; id: string }>();
    expect(apiKeyRecord.apiKey).toMatch(/^jca_/u);
    expect(apiKeyRecord.keyHash).toBeUndefined();

    const webhookResponse = await app.inject({
      method: 'POST',
      url: '/api/product/tenants/tenant_saas/webhooks',
      payload: {
        url: 'mock://tenant-saas/audit',
        events: ['audit.completed', 'batch.completed'],
        secret: 'super-secret',
      },
    });
    expect(webhookResponse.statusCode).toBe(201);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      headers: {
        'x-api-key': apiKeyRecord.apiKey,
      },
      payload: auditPayload,
    });
    expect(auditResponse.statusCode).toBe(201);
    const audit = auditResponse.json<AuditResult>();
    expect(audit.decision).toBe('REJECT');

    const usageAfterSingle = await app.inject({
      method: 'GET',
      url: '/api/product/tenants/tenant_saas/usage',
    });
    expect(usageAfterSingle.statusCode).toBe(200);
    expect(usageAfterSingle.json()).toMatchObject({
      tenant: {
        usedQuota: 1,
      },
      remainingQuota: 99,
    });

    const batchResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/batch',
      headers: {
        authorization: `Bearer ${apiKeyRecord.apiKey}`,
      },
      payload: {
        tenantId: 'tenant_saas',
        jobs: [
          {
            jobPostingId: 'batch_job_001',
            company: { name: '某某科技有限公司' },
            job: {
              title: '客服专员',
              description: '岗位职责清晰，薪资面议。',
            },
            options: {
              jurisdiction: 'CN_MAINLAND',
              enableRag: false,
            },
          },
          {
            jobPostingId: 'batch_job_002',
            company: { name: '某某科技有限公司' },
            job: {
              title: '行政专员',
              description: '限女性，入职需缴纳服装费。',
            },
            options: {
              jurisdiction: 'CN_MAINLAND',
              enableRag: false,
            },
          },
        ],
      },
    });
    expect(batchResponse.statusCode).toBe(202);
    expect(batchResponse.json()).toMatchObject({
      tenantId: 'tenant_saas',
      status: expect.stringMatching(/queued|processing|completed/u),
      totalCount: 2,
    });
    const completedBatch = await waitForBatch(app, batchResponse.json<{ id: string }>().id);
    expect(completedBatch).toMatchObject({
      status: 'completed',
      completedCount: 2,
      failedCount: 0,
    });

    const usageAfterBatch = await app.inject({
      method: 'GET',
      url: '/api/product/tenants/tenant_saas/usage',
    });
    expect(usageAfterBatch.json()).toMatchObject({
      tenant: {
        usedQuota: 3,
      },
      remainingQuota: 97,
    });

    const deliveriesResponse = await app.inject({
      method: 'GET',
      url: '/api/product/tenants/tenant_saas/webhook-deliveries',
    });
    expect(deliveriesResponse.statusCode).toBe(200);
    expect(deliveriesResponse.json<{ items: Array<{ event: string; status: string }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'audit.completed', status: 'success' }),
        expect.objectContaining({ event: 'batch.completed', status: 'success' }),
      ]),
    );

    const csvResponse = await app.inject({
      method: 'GET',
      url: `/api/audit/runs/${audit.auditId}/export?tenantId=tenant_saas&format=csv`,
    });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.body).toContain('auditId');
    expect(csvResponse.body).toContain(audit.auditId);

    const pdfResponse = await app.inject({
      method: 'GET',
      url: `/api/audit/runs/${audit.auditId}/export?tenantId=tenant_saas&format=pdf`,
    });
    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect(pdfResponse.body.slice(0, 8)).toBe('%PDF-1.4');

    const docsResponse = await app.inject({
      method: 'GET',
      url: '/api/docs',
    });
    expect(docsResponse.statusCode).toBe(200);
    expect(docsResponse.body).toContain('Job Compliance Audit Agent API');
  });

  it('rejects API keys used against another tenant', async () => {
    const app = buildApp();
    apps.push(app);

    await app.inject({
      method: 'POST',
      url: '/api/product/tenants',
      payload: {
        tenantId: 'tenant_key_owner',
        tenantName: 'Key Owner',
      },
    });

    const keyResponse = await app.inject({
      method: 'POST',
      url: '/api/product/tenants/tenant_key_owner/api-keys',
      payload: {
        name: 'Owner key',
      },
    });
    const apiKey = keyResponse.json<{ apiKey: string }>().apiKey;

    const response = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      headers: {
        'x-api-key': apiKey,
      },
      payload: {
        ...auditPayload,
        tenantId: 'tenant_other',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'API_KEY_TENANT_MISMATCH',
      },
    });
  });
});
