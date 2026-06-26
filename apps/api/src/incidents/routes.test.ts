import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import type { RuntimeSelection } from '../runtime/services.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const auditRequest = {
  tenantId: 'tenant_incident_001',
  jobPostingId: 'job_incident_001',
  company: {
    name: '事故演练公司',
  },
  job: {
    title: '行政专员',
    description: '限女性，入职需缴纳服装费。',
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

function rejectAuditResult(runtime?: RuntimeSelection): AuditResult {
  return {
    auditId: 'audit_incident_001',
    decision: 'REJECT',
    severity: 'CRITICAL',
    riskLevel: 'CRITICAL',
    summary: '命中严重风险，建议拦截。',
    findings: [
      {
        id: 'finding_incident_001',
        category: 'FEE_DEPOSIT',
        severity: 'CRITICAL',
        decision: 'REJECT',
        title: 'CN_FEE_DEPOSIT_001',
        message: '岗位疑似要求劳动者缴纳费用。',
        evidence: [],
        evidenceIds: [],
        ruleId: 'CN_FEE_DEPOSIT_001',
        suggestion: '删除收费相关内容。',
      },
    ],
    evidence: [],
    suggestions: ['删除收费相关内容。'],
    compliantRewrite: null,
    context: {
      auditId: 'audit_incident_001',
      tenantId: 'tenant_incident_001',
      requestId: 'request_incident_001',
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: runtime?.ruleVersion ?? 'incident-rule-v1',
      lawKbVersion: runtime?.lawKbVersion ?? 'local-test',
      modelVersion: runtime?.modelVersion ?? 'mock-none',
      evaluatedAt: '2026-06-26T00:00:00.000Z',
    },
    checkerResults: [],
    createdAt: '2026-06-26T00:00:00.000Z',
  };
}

describe('incident response and emergency switch API routes', () => {
  it('triggers emergency switches, degrades audit decisions, records incidents, and creates postmortems', async () => {
    const app = buildApp({
      auditJob: async (_input, _request, runtime) => rejectAuditResult(runtime),
    });
    apps.push(app);

    const switchResponse = await app.inject({
      method: 'POST',
      url: '/api/emergency/switches/disable_llm/trigger',
      payload: {
        enabled: true,
        reason: 'LLM timeout drill',
        updatedBy: 'incident_commander',
      },
    });
    expect(switchResponse.statusCode).toBe(200);
    expect(switchResponse.json()).toMatchObject({
      key: 'disable_llm',
      enabled: true,
    });

    const disableRejectResponse = await app.inject({
      method: 'PATCH',
      url: '/api/emergency/switches/disable_auto_reject',
      payload: {
        enabled: true,
        reason: '暂停自动拦截演练',
        updatedBy: 'incident_commander',
      },
    });
    expect(disableRejectResponse.statusCode).toBe(200);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest,
    });
    const audit = auditResponse.json<AuditResult>();
    expect(auditResponse.statusCode).toBe(201);
    expect(audit.decision).toBe('MANUAL_REVIEW');
    expect(audit.context.modelVersion).toBe('llm-disabled-by-emergency-switch');
    expect(audit.summary).toContain('禁用 LLM');
    expect(audit.summary).toContain('自动拦截已暂停');

    const reviewResponse = await app.inject({
      method: 'GET',
      url: '/api/reviews?status=pending&tenantId=tenant_incident_001',
    });
    expect(reviewResponse.statusCode).toBe(200);
    expect(reviewResponse.json<{ items: unknown[] }>().items).toHaveLength(1);

    const incidentResponse = await app.inject({
      method: 'POST',
      url: '/api/incidents',
      payload: {
        tenantId: 'tenant_incident_001',
        incidentType: 'llm_failure',
        severity: 'high',
        title: 'LLM 故障演练',
        description: '模型超时，已切换规则引擎降级。',
        relatedAuditRunId: audit.auditId,
        createdBy: 'incident_commander',
      },
    });
    const incident = incidentResponse.json<{ id: string }>();
    expect(incidentResponse.statusCode).toBe(201);

    const actionResponse = await app.inject({
      method: 'POST',
      url: `/api/incidents/${incident.id}/actions`,
      payload: {
        actionType: 'disable_llm',
        actorId: 'incident_commander',
        summary: '已开启 disable_llm。',
      },
    });
    expect(actionResponse.statusCode).toBe(201);

    const postmortemResponse = await app.inject({
      method: 'POST',
      url: `/api/incidents/${incident.id}/postmortem`,
      payload: {
        rootCause: 'Provider timeout drill.',
        impact: 'No production impact.',
        timeline: ['发现故障', '开启开关', '验证降级'],
        correctiveActions: ['增加超时监控'],
        preventionActions: ['定期演练'],
        createdBy: 'incident_commander',
      },
    });
    expect(postmortemResponse.statusCode).toBe(201);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/incidents/${incident.id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      incident: {
        status: 'resolved',
      },
      actions: [expect.objectContaining({ actionType: 'disable_llm' })],
      postmortem: expect.objectContaining({
        rootCause: 'Provider timeout drill.',
      }),
    });

    const drillResponse = await app.inject({
      method: 'POST',
      url: '/api/incidents/drills/rule-rollback',
      payload: {
        actorId: 'drill_operator',
        ruleVersion: '1.0.0',
      },
    });
    expect(drillResponse.statusCode).toBe(201);
    expect(drillResponse.json()).toMatchObject({
      action: {
        actionType: 'rollback_rule',
      },
      postmortem: {
        rootCause: '演练场景，无真实事故。',
      },
    });
  });
});
