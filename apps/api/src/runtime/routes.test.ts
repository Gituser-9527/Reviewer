import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import { createRuntimeServices, type RuntimeSelection } from './services.js';

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

function fakeAuditResult(tenantId: string, runtime?: RuntimeSelection): AuditResult {
  const ruleVersion = runtime?.ruleVersion ?? '1.0.0';
  const isCandidate = ruleVersion === '2.0.0';
  const now = '2026-06-22T00:00:00.000Z';
  const finding = {
    id: `finding_${tenantId}`,
    category: 'FEE_DEPOSIT' as const,
    severity: 'CRITICAL' as const,
    decision: 'REJECT' as const,
    title: 'CN_FEE_DEPOSIT_TEST',
    message: '岗位存在入职收费风险。',
    evidence: [
      {
        id: 'evidence_runtime_test',
        title: '岗位原文',
        sourceType: 'JOB_TEXT',
        url: 'job://description',
        version: 'input',
        quote: '入职收费',
      },
    ],
    evidenceIds: ['evidence_runtime_test'],
    ruleId: 'CN_FEE_DEPOSIT_TEST',
    evidenceId: 'evidence_runtime_test',
    metadata: {
      matchedText: ['入职收费'],
    },
  };
  return {
    auditId: `audit_${tenantId}_${ruleVersion.replaceAll('.', '_')}`,
    decision: isCandidate ? 'REJECT' : 'PASS',
    ...(isCandidate ? { severity: 'CRITICAL' as const } : {}),
    riskLevel: isCandidate ? 'CRITICAL' : 'NONE',
    summary: isCandidate ? '发现 1 个风险项。' : '未发现当前规则集可识别的岗位合规风险。',
    findings: isCandidate ? [finding] : [],
    evidence: isCandidate ? finding.evidence : [],
    suggestions: [],
    compliantRewrite: null,
    context: {
      auditId: `audit_${tenantId}_${ruleVersion.replaceAll('.', '_')}`,
      tenantId,
      requestId: `request_${tenantId}`,
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion,
      lawKbVersion: runtime?.lawKbVersion ?? 'local-2026-06-12',
      modelVersion: runtime?.modelVersion ?? 'mock-none',
      evaluatedAt: now,
    },
    checkerResults: [],
    createdAt: now,
  };
}

describe('runtime monitoring and rollout routes', () => {
  it('selects rule versions by tenant, records metrics, creates alerts and rolls back', async () => {
    const runtimeServices = createRuntimeServices();
    const app = buildApp({
      runtimeServices,
      auditJob: async (_input, request, runtime) => fakeAuditResult(request.tenantId, runtime),
    });
    apps.push(app);

    const configsResponse = await app.inject({ method: 'GET', url: '/api/runtime-configs' });
    expect(configsResponse.statusCode).toBe(200);
    expect(configsResponse.json<{ items: unknown[] }>().items).toHaveLength(3);

    const rolloutResponse = await app.inject({
      method: 'POST',
      url: '/api/rollouts',
      payload: {
        target: 'ruleVersion',
        stableVersion: '1.0.0',
        candidateVersion: '2.0.0',
        tenantAllowList: ['tenant_canary'],
        rolloutPercent: 0,
        createdBy: 'test_runner',
      },
    });
    expect(rolloutResponse.statusCode).toBe(201);
    const rollout = rolloutResponse.json<{ id: string }>();

    const canaryAuditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest('tenant_canary'),
    });
    const canaryAudit = canaryAuditResponse.json<AuditResult>();
    expect(canaryAuditResponse.statusCode).toBe(201);
    expect(canaryAudit.context.ruleVersion).toBe('2.0.0');
    expect(canaryAudit.context.modelVersion).toBe('mock-none');
    expect(canaryAudit.decision).toBe('REJECT');

    const stableAuditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest('tenant_stable'),
    });
    const stableAudit = stableAuditResponse.json<AuditResult>();
    expect(stableAuditResponse.statusCode).toBe(201);
    expect(stableAudit.context.ruleVersion).toBe('1.0.0');
    expect(stableAudit.decision).toBe('PASS');

    const metricsResponse = await app.inject({ method: 'GET', url: '/api/metrics/audit' });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      audit_total: 2,
      reject_rate: 0.5,
      manual_review_rate: 0,
      version_distribution: {
        '1.0.0': 1,
        '2.0.0': 1,
      },
    });

    const alertsResponse = await app.inject({ method: 'GET', url: '/api/alerts' });
    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json<{ items: Array<{ metricKey: string }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ metricKey: 'reject_rate' })]),
    );

    const rollbackResponse = await app.inject({
      method: 'POST',
      url: `/api/rollouts/${rollout.id}/rollback`,
    });
    expect(rollbackResponse.statusCode).toBe(200);
    expect(rollbackResponse.json()).toMatchObject({ status: 'rolled_back' });

    const postRollbackAuditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest('tenant_canary'),
    });
    expect(postRollbackAuditResponse.statusCode).toBe(201);
    expect(postRollbackAuditResponse.json<AuditResult>().context.ruleVersion).toBe('1.0.0');
  });
});
