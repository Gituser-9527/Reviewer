import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const auditRequest = {
  tenantId: 'tenant_labeling',
  jobPostingId: 'job_labeling',
  company: {
    name: '某某科技有限公司',
  },
  job: {
    title: '行政专员',
    description: '招聘行政专员，限女性。',
    location: '北京',
    salary: '8k-15k',
    employmentType: 'full_time',
  },
  options: {
    jurisdiction: 'CN_MAINLAND',
    enableRewrite: false,
    enableRag: false,
  },
} as const;

function manualReviewResult(): AuditResult {
  const now = '2026-06-23T00:00:00.000Z';
  return {
    auditId: 'audit_labeling_001',
    decision: 'MANUAL_REVIEW',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    summary: '发现 1 个风险项，建议人工复核。',
    findings: [
      {
        id: 'finding_labeling_001',
        category: 'DISCRIMINATION',
        severity: 'HIGH',
        decision: 'MANUAL_REVIEW',
        title: 'CN_DISCRIMINATION_GENDER_001',
        message: '岗位存在疑似就业歧视风险。',
        evidence: [
          {
            id: 'evidence_labeling_001',
            title: '岗位原文',
            sourceType: 'JOB_TEXT',
            url: 'job://description',
            version: 'input',
            quote: '限女性',
          },
        ],
        evidenceIds: ['evidence_labeling_001'],
        ruleId: 'CN_DISCRIMINATION_GENDER_001',
        evidenceId: 'evidence_labeling_001',
        suggestion: '删除与履职无关的性别限制。',
        metadata: {
          matchedText: ['限女性'],
        },
      },
    ],
    evidence: [],
    suggestions: ['删除与履职无关的性别限制。'],
    compliantRewrite: null,
    context: {
      auditId: 'audit_labeling_001',
      tenantId: 'tenant_labeling',
      requestId: 'request_labeling_001',
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

describe('review labeling routes', () => {
  it('supports multi-reviewer labels, agreement stats, disputed cases and senior resolution', async () => {
    const app = buildApp({
      auditJob: async () => manualReviewResult(),
    });
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest,
    });
    expect(auditResponse.statusCode).toBe(201);

    const referenceResponse = await app.inject({ method: 'GET', url: '/api/labeling/reference' });
    expect(referenceResponse.statusCode).toBe(200);
    expect(referenceResponse.json()).toMatchObject({
      riskLevels: expect.arrayContaining([expect.objectContaining({ level: 'CRITICAL' })]),
      feedbackTypes: expect.arrayContaining([expect.objectContaining({ type: 'FALSE_POSITIVE' })]),
    });

    const firstLabelResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_labeling_001/reviewer-decisions',
      payload: {
        reviewerId: 'reviewer_a',
        finalDecision: 'REQUEST_REVISION',
        categories: ['DISCRIMINATION'],
        severity: 'HIGH',
        feedbackType: 'VALID_RESULT',
        comment: '建议企业删除性别限制。',
        confidence: 0.9,
      },
    });
    expect(firstLabelResponse.statusCode).toBe(201);

    const secondLabelResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_labeling_001/reviewer-decisions',
      payload: {
        reviewerId: 'reviewer_b',
        finalDecision: 'REQUEST_REVISION',
        categories: ['DISCRIMINATION'],
        severity: 'HIGH',
        feedbackType: 'VALID_RESULT',
        comment: '同意要求修改。',
        confidence: 0.9,
      },
    });
    expect(secondLabelResponse.statusCode).toBe(201);

    const statsResponse = await app.inject({ method: 'GET', url: '/api/reviewer-agreement-stats' });
    expect(statsResponse.statusCode).toBe(200);
    expect(statsResponse.json<{ items: Array<{ agreementRate: number }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ agreementRate: 1 })]),
    );

    const changedLabelResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_labeling_001/reviewer-decisions',
      payload: {
        reviewerId: 'reviewer_b',
        finalDecision: 'APPROVE',
        categories: [],
        severity: 'NONE',
        feedbackType: 'FALSE_POSITIVE',
        comment: '认为该岗位可通过。',
        confidence: 0.6,
      },
    });
    expect(changedLabelResponse.statusCode).toBe(201);

    const disputesResponse = await app.inject({ method: 'GET', url: '/api/disputed-cases' });
    expect(disputesResponse.statusCode).toBe(200);
    const disputes = disputesResponse.json<{ items: Array<{ id: string; status: string }> }>().items;
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({ status: 'open' });

    const addToEvalBlockedResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_labeling_001/add-to-eval',
      payload: {
        datasetId: 'labeling_eval',
      },
    });
    expect(addToEvalBlockedResponse.statusCode).toBe(409);
    expect(addToEvalBlockedResponse.json()).toMatchObject({
      error: { code: 'LABEL_DISPUTE_UNRESOLVED' },
    });

    const disputeId = disputes[0]?.id;
    expect(disputeId).toBeDefined();
    const resolveResponse = await app.inject({
      method: 'POST',
      url: `/api/disputed-cases/${disputeId}/resolve`,
      payload: {
        resolvedBy: 'senior_reviewer',
        finalDecision: 'REQUEST_REVISION',
        finalCategories: ['DISCRIMINATION'],
        finalSeverity: 'HIGH',
        resolutionComment: '以删除性别限制后重提为准。',
      },
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(resolveResponse.json()).toMatchObject({
      status: 'resolved',
      finalDecision: 'REQUEST_REVISION',
      finalSeverity: 'HIGH',
    });

    const addToEvalResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_labeling_001/add-to-eval',
      payload: {
        datasetId: 'labeling_eval',
      },
    });
    expect(addToEvalResponse.statusCode).toBe(201);
    expect(addToEvalResponse.json()).toMatchObject({
      case: {
        expectedDecision: 'MANUAL_REVIEW',
        expectedCategories: ['DISCRIMINATION'],
        expectedSeverity: 'HIGH',
        metadata: {
          labelSchemaVersion: 'review-label-v1',
          unifiedLabel: {
            source: 'senior_resolution',
          },
        },
      },
    });
  });
});
