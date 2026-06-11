import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const validRequest = {
  tenantId: 'tenant_001',
  jobPostingId: 'job_001',
  company: {
    name: '某某科技有限公司',
  },
  job: {
    title: '行政专员',
    description: '限女性，已婚已育优先，入职需缴纳500元服装费',
    location: '北京',
    salary: '8k-15k',
    employmentType: 'full_time',
  },
  options: {
    jurisdiction: 'CN_MAINLAND',
    enableRewrite: true,
    enableRag: false,
  },
} as const;

describe('audit API routes', () => {
  it('audits a job posting, stores the run, and retrieves it by id', async () => {
    const app = buildApp();
    apps.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: validRequest,
    });
    const created = createResponse.json<AuditResult>();

    expect(createResponse.statusCode).toBe(201);
    expect(created.decision).toBe('REJECT');
    expect(created.riskLevel).toBe('CRITICAL');
    expect(created.context.tenantId).toBe('tenant_001');
    expect(created.context.jurisdiction).toBe('CN_MAINLAND');
    expect(created.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining(['DISCRIMINATION', 'FEE_DEPOSIT']),
    );

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/audit/runs/${created.auditId}`,
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(created);
  });

  it('returns a structured validation error for an invalid body', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: {
        ...validRequest,
        job: {
          ...validRequest.job,
          title: '',
        },
      },
    });
    const payload = response.json();

    expect(response.statusCode).toBe(400);
    expect(payload).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        retryable: false,
      },
    });
    expect(payload.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'job.title' })]),
    );
  });

  it('returns 404 for an unknown audit run', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/runs/missing-run',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'AUDIT_RUN_NOT_FOUND',
        retryable: false,
      },
    });
  });

  it('returns a safe 500 response when the orchestrator fails', async () => {
    const app = buildApp({
      auditJob: async () => {
        throw new Error('sensitive internal failure');
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: validRequest,
    });
    const payload = response.json();

    expect(response.statusCode).toBe(500);
    expect(payload).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        retryable: false,
      },
    });
    expect(response.body).not.toContain('sensitive internal failure');
  });
});
