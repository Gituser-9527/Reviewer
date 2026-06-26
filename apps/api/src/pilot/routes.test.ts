import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const auditRequest = {
  tenantId: 'tenant_pilot_001',
  jobPostingId: 'job_pilot_001',
  company: {
    name: '试点客户有限公司',
  },
  job: {
    title: '行政专员',
    description: '限女性，已婚已育优先。',
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

function pilotAuditResult(): AuditResult {
  return {
    auditId: 'audit_pilot_001',
    decision: 'REJECT',
    severity: 'CRITICAL',
    riskLevel: 'CRITICAL',
    summary: '岗位存在较高合规风险，建议拦截并修改后重新提交。',
    findings: [
      {
        id: 'finding_pilot_001',
        category: 'DISCRIMINATION',
        severity: 'CRITICAL',
        decision: 'REJECT',
        title: 'CN_DISCRIMINATION_GENDER_001',
        message: '岗位存在疑似就业歧视风险。',
        evidence: [],
        evidenceIds: [],
        ruleId: 'CN_DISCRIMINATION_GENDER_001',
        suggestion: '删除与履职无关的性别限制。',
      },
    ],
    evidence: [],
    suggestions: ['删除与履职无关的性别限制。'],
    compliantRewrite: null,
    context: {
      auditId: 'audit_pilot_001',
      tenantId: 'tenant_pilot_001',
      requestId: 'request_pilot_001',
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: 'pilot-rule-v1',
      lawKbVersion: 'local-test',
      evaluatedAt: '2026-06-26T00:00:00.000Z',
    },
    checkerResults: [],
    createdAt: '2026-06-26T10:00:00.000Z',
  };
}

describe('pilot ROI API routes', () => {
  it('creates a pilot project, calculates ROI metrics, exports a report, and records feedback', async () => {
    const app = buildApp({
      auditJob: async () => pilotAuditResult(),
    });
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest,
    });
    expect(auditResponse.statusCode).toBe(201);

    const betaRunsResponse = await app.inject({
      method: 'GET',
      url: '/api/beta-trial/runs?tenantId=tenant_pilot_001',
    });
    const betaRun = betaRunsResponse.json<{ items: Array<{ id: string }> }>().items[0];
    expect(betaRun).toBeDefined();

    const humanResultResponse = await app.inject({
      method: 'POST',
      url: `/api/beta-trial/runs/${betaRun?.id}/human-result`,
      payload: {
        reviewerId: 'pilot_reviewer_001',
        finalDecision: 'APPROVE',
        feedbackType: 'FALSE_POSITIVE',
        comment: '试点人工认为本样本不应自动拦截。',
      },
    });
    expect(humanResultResponse.statusCode).toBe(200);

    const createProjectResponse = await app.inject({
      method: 'POST',
      url: '/api/pilots/projects',
      payload: {
        tenantId: 'tenant_pilot_001',
        name: 'A 客户招聘合规试点',
        startDate: '2026-06-26',
        endDate: '2026-06-26',
        modes: ['shadow_mode', 'assist_mode', 'enforce_mode'],
        avgReviewTimeBefore: 8,
        avgReviewTimeAfter: 2,
        hourlyLaborCost: 120,
        description: '用于评估业务价值。',
      },
    });
    const project = createProjectResponse.json<{ id: string; tenantId: string }>();

    expect(createProjectResponse.statusCode).toBe(201);
    expect(project.tenantId).toBe('tenant_pilot_001');

    const feedbackResponse = await app.inject({
      method: 'POST',
      url: `/api/pilots/projects/${project.id}/feedback`,
      payload: {
        feedbackType: 'satisfaction',
        rating: 4,
        contactName: '客户经理',
        comment: '试点看板能说明节省时间，但还需要更多样本。',
      },
    });
    expect(feedbackResponse.statusCode).toBe(201);

    const dashboardResponse = await app.inject({
      method: 'GET',
      url: `/api/pilots/projects/${project.id}/dashboard`,
    });
    const dashboard = dashboardResponse.json<{
      dailyMetrics: Array<{ totalJobsAudited: number; falsePositiveRate: number }>;
      report: { totalJobsAudited: number; risksAndLimitations: string[]; markdown: string };
      feedback: unknown[];
    }>();

    expect(dashboardResponse.statusCode).toBe(200);
    expect(dashboard.dailyMetrics.some((metric) => metric.totalJobsAudited > 0)).toBe(true);
    expect(dashboard.report.totalJobsAudited).toBe(1);
    expect(dashboard.report.risksAndLimitations.length).toBeGreaterThan(0);
    expect(dashboard.report.markdown).toContain('风险和限制说明');
    expect(dashboard.feedback).toHaveLength(1);

    const reportResponse = await app.inject({
      method: 'POST',
      url: `/api/pilots/projects/${project.id}/roi-report`,
    });
    expect(reportResponse.statusCode).toBe(201);
    expect(reportResponse.json()).toMatchObject({
      pilotProjectId: project.id,
      totalJobsAudited: 1,
    });

    const exportResponse = await app.inject({
      method: 'GET',
      url: `/api/pilots/projects/${project.id}/roi-report/export?format=markdown`,
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/markdown');
    expect(exportResponse.body).toContain('试点 ROI 报告');

    const feedbackListResponse = await app.inject({
      method: 'GET',
      url: `/api/pilots/feedback?pilotProjectId=${project.id}`,
    });
    expect(feedbackListResponse.statusCode).toBe(200);
    expect(feedbackListResponse.json<{ items: unknown[] }>().items).toHaveLength(1);
  });
});
