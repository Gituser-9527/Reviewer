import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import type { QaInspectionJob, QaQualityIssue } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const auditRequest = {
  tenantId: 'tenant_qa_001',
  jobPostingId: 'job_qa_001',
  company: {
    name: '某某科技有限公司',
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

function qaManualReviewResult(): AuditResult {
  return {
    auditId: 'audit_qa_001',
    decision: 'MANUAL_REVIEW',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    summary: '发现 1 个风险项，建议人工复核。',
    findings: [
      {
        id: 'finding_qa_001',
        category: 'DISCRIMINATION',
        severity: 'HIGH',
        decision: 'MANUAL_REVIEW',
        title: 'CN_DISCRIMINATION_GENDER_001',
        message: '岗位存在疑似就业歧视风险。',
        evidence: [],
        evidenceIds: [],
        ruleId: 'CN_DISCRIMINATION_GENDER_001',
        suggestion: '删除与履职无关的性别限制。',
        metadata: {
          matchedText: ['限女性'],
        },
      },
    ],
    evidence: [],
    suggestions: ['删除与履职无关的性别限制。'],
    compliantRewrite: '招聘行政专员，限女性，待遇从优。',
    context: {
      auditId: 'audit_qa_001',
      tenantId: 'tenant_qa_001',
      requestId: 'request_qa_001',
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: 'qa-rule-v1',
      lawKbVersion: 'local-test',
      evaluatedAt: '2026-06-18T00:00:00.000Z',
    },
    checkerResults: [],
    createdAt: '2026-06-18T00:00:00.000Z',
  };
}

describe('QA inspection API routes', () => {
  it('creates an inspection job, reports issues, and resolves an issue into eval and rule suggestions', async () => {
    const app = buildApp({
      auditJob: async () => qaManualReviewResult(),
    });
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest,
    });
    expect(auditResponse.statusCode).toBe(201);

    const reviewResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_qa_001/decision',
      payload: {
        reviewerId: 'reviewer_qa_001',
        finalDecision: 'REQUEST_REVISION',
        feedbackType: 'VALID_RESULT',
        comment: '人工确认需要修改性别限制。',
        falsePositive: false,
        falseNegative: false,
      },
    });
    expect(reviewResponse.statusCode).toBe(200);

    const createJobResponse = await app.inject({
      method: 'POST',
      url: '/api/qa/inspection-jobs',
      payload: {
        tenantId: 'tenant_qa_001',
        strategy: 'high_risk_first',
        sampleSize: 10,
        ruleVersion: 'qa-rule-v1',
        reviewerId: 'reviewer_qa_001',
      },
    });
    const job = createJobResponse.json<QaInspectionJob>();

    expect(createJobResponse.statusCode).toBe(201);
    expect(job).toMatchObject({
      tenantId: 'tenant_qa_001',
      strategy: 'high_risk_first',
      status: 'completed',
    });
    expect(job.sampleCount).toBeGreaterThanOrEqual(2);
    expect(job.issueCount).toBeGreaterThanOrEqual(1);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/qa/inspection-jobs/${job.id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: job.id,
      samples: expect.any(Array),
      results: expect.any(Array),
    });

    const issueListResponse = await app.inject({
      method: 'GET',
      url: '/api/qa/issues?tenantId=tenant_qa_001&status=open',
    });
    const issues = issueListResponse.json<{ items: QaQualityIssue[] }>().items;
    const auditIssue = issues.find((issue) => issue.sourceType === 'audit_run');

    expect(issueListResponse.statusCode).toBe(200);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.map((issue) => issue.issueType)).toEqual(
      expect.arrayContaining(['BAD_MATCHED_TEXT']),
    );
    expect(auditIssue).toBeDefined();

    const resolveResponse = await app.inject({
      method: 'POST',
      url: `/api/qa/issues/${auditIssue?.id}/resolve`,
      payload: {
        resolvedBy: 'qa_manager_001',
        resolutionComment: '已沉淀为回归样本，并生成规则改进建议。',
        addToEval: true,
        createRuleSuggestion: true,
        datasetId: 'qa_failed_samples_test',
      },
    });
    const resolved = resolveResponse.json<QaQualityIssue>();

    expect(resolveResponse.statusCode).toBe(200);
    expect(resolved.status).toBe('resolved');
    expect(resolved.linkedEvalCaseId).toBe(`case_from_qa_${auditIssue?.id}`);
    expect(resolved.linkedRuleSuggestionId).toEqual(expect.stringContaining('rule_suggestion_'));

    const evalCasesResponse = await app.inject({
      method: 'GET',
      url: '/api/evals/datasets/qa_failed_samples_test/cases',
    });
    expect(evalCasesResponse.statusCode).toBe(200);
    expect(evalCasesResponse.json<{ items: unknown[] }>().items).toHaveLength(1);

    const suggestionsResponse = await app.inject({
      method: 'GET',
      url: '/api/rule-suggestions?tenantId=tenant_qa_001&status=open',
    });
    expect(suggestionsResponse.statusCode).toBe(200);
    expect(suggestionsResponse.json<{ items: unknown[] }>().items).toHaveLength(1);
  });
});
