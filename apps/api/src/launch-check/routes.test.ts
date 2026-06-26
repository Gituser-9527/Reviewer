import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const sensitiveAuditRequest = {
  tenantId: 'tenant_security',
  jobPostingId: 'job_security_001',
  company: {
    name: '某某科技有限公司',
  },
  job: {
    title: '行政专员',
    description: '招聘行政专员，限女性。联系手机号13812345678，身份证110101199001011234。',
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

describe('launch security compliance routes', () => {
  it('configures retention, generates launch report, exports audit logs, and executes deletion', async () => {
    const app = buildApp();
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: sensitiveAuditRequest,
    });
    expect(auditResponse.statusCode).toBe(201);
    const audit = auditResponse.json<AuditResult>();
    expect(audit.context.tenantId).toBe('tenant_security');

    const retentionResponse = await app.inject({
      method: 'POST',
      url: '/api/security/data-retention/jobs',
      payload: {
        tenantId: 'tenant_security',
        resourceType: 'audit_runs',
        retentionDays: 180,
        enabled: true,
      },
    });
    expect(retentionResponse.statusCode).toBe(201);
    expect(retentionResponse.json()).toMatchObject({
      tenantId: 'tenant_security',
      resourceType: 'audit_runs',
      retentionDays: 180,
      enabled: true,
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/api/security/launch-check/report',
    });
    expect(reportResponse.statusCode).toBe(200);
    const report = reportResponse.json<{
      status: string;
      checks: Array<{ id: string; status: string; detail: string }>;
    }>();
    expect(report.status).toBe('ready');
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'llm_input_redaction', status: 'pass' }),
        expect.objectContaining({ id: 'explainable_blocking', status: 'pass' }),
      ]),
    );
    const llmCheck = report.checks.find((check) => check.id === 'llm_input_redaction');
    expect(llmCheck?.detail).not.toContain('13812345678');
    expect(llmCheck?.detail).not.toContain('110101199001011234');
    expect(llmCheck?.detail).not.toContain('test@example.com');

    const exportResponse = await app.inject({
      method: 'POST',
      url: '/api/security/privacy-export-requests',
      payload: {
        tenantId: 'tenant_security',
      },
    });
    expect(exportResponse.statusCode).toBe(201);
    expect(exportResponse.body).not.toContain('13812345678');
    expect(exportResponse.body).not.toContain('110101199001011234');
    expect(exportResponse.json()).toMatchObject({
      tenantId: 'tenant_security',
      status: 'completed',
    });

    const deletionCreateResponse = await app.inject({
      method: 'POST',
      url: '/api/security/data-deletion-requests',
      payload: {
        tenantId: 'tenant_security',
        targetType: 'tenant',
        reason: '用户要求删除联系信息 13812345678',
      },
    });
    expect(deletionCreateResponse.statusCode).toBe(201);
    expect(deletionCreateResponse.body).not.toContain('13812345678');
    const deletion = deletionCreateResponse.json<{ id: string }>();

    const deletionExecuteResponse = await app.inject({
      method: 'POST',
      url: `/api/security/data-deletion-requests/${deletion.id}/execute`,
    });
    expect(deletionExecuteResponse.statusCode).toBe(200);
    expect(deletionExecuteResponse.json()).toMatchObject({
      id: deletion.id,
      tenantId: 'tenant_security',
      status: 'completed',
      deletedRecords: 1,
    });

    const listAuditRunsResponse = await app.inject({
      method: 'GET',
      url: '/api/audit/runs?tenantId=tenant_security',
    });
    expect(listAuditRunsResponse.statusCode).toBe(200);
    expect(listAuditRunsResponse.json()).toEqual({ items: [] });
  });

  it('requires global management permission for launch report generation', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/security/launch-check/report',
      headers: {
        'x-user-id': 'viewer_001',
        'x-user-role': 'VIEWER',
        'x-tenant-id': 'tenant_security',
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
