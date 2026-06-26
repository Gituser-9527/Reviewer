import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import { BetaTrialService } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function auditRequest(tenantId: string) {
  return {
    tenantId,
    jobPostingId: `job_${tenantId}`,
    company: {
      name: '某某科技有限公司',
    },
    job: {
      title: '行政专员',
      description: '岗位职责清晰，薪资面议。',
      location: '北京',
      salary: '8k-15k',
      employmentType: 'full_time',
    },
    options: {
      jurisdiction: 'CN_MAINLAND',
      enableRewrite: false,
      enableRag: false,
    },
  };
}

function fakeResult(tenantId: string, decision: AuditResult['decision']): AuditResult {
  const now = new Date().toISOString();
  const risky = decision !== 'PASS';
  const finding = {
    id: `finding_${tenantId}`,
    category: 'FEE_DEPOSIT' as const,
    severity: 'CRITICAL' as const,
    decision: 'REJECT' as const,
    title: 'CN_FEE_DEPOSIT_TEST',
    message: '岗位存在入职收费风险。',
    evidence: [
      {
        id: 'evidence_fee_test',
        title: '岗位原文',
        sourceType: 'JOB_TEXT',
        url: 'job://description',
        version: 'input',
        quote: '入职收费',
      },
    ],
    evidenceIds: ['evidence_fee_test'],
    ruleId: 'CN_FEE_DEPOSIT_TEST',
    evidenceId: 'evidence_fee_test',
    metadata: {
      matchedText: ['入职收费'],
    },
  };
  return {
    auditId: `audit_${tenantId}`,
    decision,
    ...(risky ? { severity: 'CRITICAL' as const } : {}),
    riskLevel: risky ? 'CRITICAL' : 'NONE',
    summary: risky ? '发现 1 个风险项。' : '未发现当前规则集可识别的岗位合规风险。',
    findings: risky ? [finding] : [],
    evidence: risky ? finding.evidence : [],
    suggestions: [],
    compliantRewrite: null,
    context: {
      auditId: `audit_${tenantId}`,
      tenantId,
      requestId: `request_${tenantId}`,
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      modelVersion: 'mock-none',
      evaluatedAt: now,
    },
    checkerResults: [],
    createdAt: now,
  };
}

describe('beta trial routes', () => {
  it('configures tenant modes, records shadow/enforce runs and reports mismatches', async () => {
    const betaTrialService = new BetaTrialService();
    const app = buildApp({
      betaTrialService,
      auditJob: async (_input, request) =>
        fakeResult(request.tenantId, request.tenantId === 'tenant_shadow' ? 'PASS' : 'REJECT'),
    });
    apps.push(app);

    const shadowModeResponse = await app.inject({
      method: 'PATCH',
      url: '/api/beta-trial/tenant-modes/tenant_shadow',
      payload: {
        mode: 'shadow_mode',
        enabled: true,
        updatedBy: 'test_operator',
      },
    });
    expect(shadowModeResponse.statusCode).toBe(200);
    expect(shadowModeResponse.json()).toMatchObject({
      tenantId: 'tenant_shadow',
      mode: 'shadow_mode',
    });

    const enforceModeResponse = await app.inject({
      method: 'PATCH',
      url: '/api/beta-trial/tenant-modes/tenant_enforce',
      payload: {
        mode: 'enforce_mode',
        enabled: true,
        updatedBy: 'test_operator',
      },
    });
    expect(enforceModeResponse.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest('tenant_shadow'),
    });
    await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest('tenant_enforce'),
    });

    const runsResponse = await app.inject({ method: 'GET', url: '/api/beta-trial/runs' });
    expect(runsResponse.statusCode).toBe(200);
    const runs = runsResponse.json<{ items: Array<{ id: string; tenantId: string; businessImpactApplied: boolean }> }>().items;
    const shadowRun = runs.find((run) => run.tenantId === 'tenant_shadow');
    const enforceRun = runs.find((run) => run.tenantId === 'tenant_enforce');
    expect(shadowRun).toMatchObject({ businessImpactApplied: false });
    expect(enforceRun).toMatchObject({ businessImpactApplied: true });

    expect(shadowRun).toBeDefined();
    const humanResultResponse = await app.inject({
      method: 'POST',
      url: `/api/beta-trial/runs/${shadowRun?.id}/human-result`,
      payload: {
        reviewerId: 'human_001',
        finalDecision: 'REJECT',
        feedbackType: 'FALSE_NEGATIVE',
        comment: '人工认为存在严重风险。',
      },
    });
    expect(humanResultResponse.statusCode).toBe(200);
    expect(humanResultResponse.json()).toMatchObject({
      comparisonResult: 'DISAGREE',
      falseNegative: true,
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: '/api/beta-trial/reports/daily?tenantId=tenant_shadow',
    });
    expect(reportResponse.statusCode).toBe(200);
    expect(reportResponse.json()).toMatchObject({
      total: 1,
      compared: 1,
      agentHumanAgreementRate: 0,
      falseNegativeRate: 1,
    });
    expect(reportResponse.json<{ mismatchSamples: unknown[] }>().mismatchSamples).toHaveLength(1);

    const mismatchResponse = await app.inject({
      method: 'GET',
      url: '/api/beta-trial/runs?mismatchOnly=true',
    });
    expect(mismatchResponse.statusCode).toBe(200);
    expect(mismatchResponse.json<{ items: unknown[] }>().items).toHaveLength(1);
  });
});
