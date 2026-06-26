import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('UAT acceptance API routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('generates UAT reports, blocks failed gates, and opens Beta after GO decision', async () => {
    app = buildApp();

    const blockedReportResponse = await app.inject({
      method: 'POST',
      url: '/api/uat/reports',
      payload: {
        generatedBy: 'uat_tester',
        checks: [
          {
            key: 'security',
            status: 'fail',
            detail: '安全检查未通过。',
            evidence: '阻塞项测试。',
          },
        ],
      },
    });
    expect(blockedReportResponse.statusCode).toBe(201);
    const blockedReport = blockedReportResponse.json<{
      id: string;
      goNoGoDecision: string;
      blockers: unknown[];
    }>();
    expect(blockedReport.goNoGoDecision).toBe('NO_GO');
    expect(blockedReport.blockers).toHaveLength(1);

    const blockedApproval = await app.inject({
      method: 'POST',
      url: `/api/uat/reports/${blockedReport.id}/approve-beta`,
      payload: {
        tenantId: 'tenant_uat',
        startDate: '2026-06-26',
        endDate: '2026-07-10',
      },
    });
    expect(blockedApproval.statusCode).toBe(409);
    expect(blockedApproval.json<{ error: { code: string } }>().error.code).toBe('UAT_BLOCKED');

    const goReportResponse = await app.inject({
      method: 'POST',
      url: '/api/uat/reports',
      payload: {
        generatedBy: 'uat_tester',
      },
    });
    expect(goReportResponse.statusCode).toBe(201);
    const goReport = goReportResponse.json<{
      id: string;
      goNoGoDecision: string;
      blockers: unknown[];
      checks: unknown[];
      metrics: Record<string, unknown>;
    }>();
    expect(goReport.goNoGoDecision).toBe('GO');
    expect(goReport.blockers).toHaveLength(0);
    expect(goReport.checks.length).toBeGreaterThanOrEqual(9);
    expect(goReport.metrics).toHaveProperty('redTeamRecall');

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/uat/reports/${goReport.id}/approve-beta`,
      payload: {
        tenantId: 'tenant_uat',
        name: 'UAT 通过 Beta',
        mode: 'shadow',
        startDate: '2026-06-26',
        endDate: '2026-07-10',
      },
    });
    expect(approvalResponse.statusCode).toBe(201);
    const approval = approvalResponse.json<{
      report: { approvedBetaProgramId: string };
      betaProgram: { id: string; tenantId: string; mode: string };
    }>();
    expect(approval.report.approvedBetaProgramId).toBe(approval.betaProgram.id);
    expect(approval.betaProgram.tenantId).toBe('tenant_uat');
    expect(approval.betaProgram.mode).toBe('shadow');

    const betaProgramsResponse = await app.inject({
      method: 'GET',
      url: '/api/beta-programs?tenantId=tenant_uat',
    });
    expect(betaProgramsResponse.statusCode).toBe(200);
    expect(
      betaProgramsResponse
        .json<{ items: Array<{ id: string }> }>()
        .items.some((program) => program.id === approval.betaProgram.id),
    ).toBe(true);
  });
});
