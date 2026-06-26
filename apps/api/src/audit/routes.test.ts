import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult, HumanReviewTicket } from '@job-compliance/shared';
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

function manualReviewResult(): AuditResult {
  return {
    auditId: 'audit_manual_001',
    decision: 'MANUAL_REVIEW',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    summary: '发现 1 个风险项，建议人工复核。',
    findings: [
      {
        id: 'finding_manual_001',
        category: 'DISCRIMINATION',
        severity: 'HIGH',
        decision: 'MANUAL_REVIEW',
        title: 'CN_DISCRIMINATION_GENDER_001',
        message: '岗位存在疑似就业歧视风险。',
        evidence: [
          {
            id: 'evidence_manual_001',
            title: '岗位原文',
            sourceType: 'JOB_TEXT',
            url: 'job://description',
            version: 'input',
            quote: '限女性',
          },
        ],
        evidenceIds: ['evidence_manual_001'],
        ruleId: 'CN_DISCRIMINATION_GENDER_001',
        evidenceId: 'evidence_manual_001',
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
      auditId: 'audit_manual_001',
      tenantId: 'tenant_001',
      requestId: 'request_manual_001',
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      evaluatedAt: '2026-06-18T00:00:00.000Z',
    },
    checkerResults: [],
    createdAt: '2026-06-18T00:00:00.000Z',
  };
}

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

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/audit/runs?tenantId=tenant_001',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({ items: [created] });
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

  it('returns locally maintained authority evidence when RAG is enabled', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: {
        ...validRequest,
        options: {
          ...validRequest.options,
          enableRag: true,
        },
      },
    });
    const result = response.json<AuditResult>();

    expect(response.statusCode).toBe(201);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'CN_LAW_EMPLOYMENT_PROMOTION_FAIR_EMPLOYMENT',
          sourceType: 'LAW',
        }),
        expect.objectContaining({
          id: 'CN_LAW_LABOR_CONTRACT_FEE_DEPOSIT',
          sourceType: 'LAW',
        }),
      ]),
    );
    expect(result.findings.some((finding) => finding.evidenceIds.length > 0)).toBe(true);
  });

  it('creates and closes a human review ticket for MANUAL_REVIEW audit results', async () => {
    const app = buildApp({
      auditJob: async () => manualReviewResult(),
    });
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: {
        ...validRequest,
        job: {
          ...validRequest.job,
          description: '招聘行政专员，限女性。',
        },
      },
    });
    const audit = auditResponse.json<AuditResult>();

    expect(auditResponse.statusCode).toBe(201);
    expect(audit.decision).toBe('MANUAL_REVIEW');

    const pendingResponse = await app.inject({
      method: 'GET',
      url: '/api/reviews?status=pending&tenantId=tenant_001',
    });
    const pending = pendingResponse.json<{ items: HumanReviewTicket[] }>();

    expect(pendingResponse.statusCode).toBe(200);
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      id: 'audit_manual_001',
      auditRunId: 'audit_manual_001',
      status: 'pending',
      riskLevel: 'HIGH',
      suggestedAction: 'MANUAL_REVIEW',
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: '/api/reviews/audit_manual_001',
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json<HumanReviewTicket>().findings[0]?.metadata?.matchedText).toEqual([
      '限女性',
    ]);

    const createAgainResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      payload: {
        auditRunId: 'audit_manual_001',
        tenantId: 'tenant_001',
      },
    });

    expect(createAgainResponse.statusCode).toBe(201);
    expect(createAgainResponse.json<HumanReviewTicket>()).toMatchObject({
      id: 'audit_manual_001',
      status: 'pending',
    });

    const decisionResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_manual_001/decision',
      payload: {
        reviewerId: 'mock_reviewer_001',
        finalDecision: 'REQUEST_REVISION',
        feedbackType: 'RULE_TOO_BROAD',
        comment: '请删除性别限制后重新提交。',
        falsePositive: false,
        falseNegative: false,
      },
    });
    const closed = decisionResponse.json<HumanReviewTicket>();

    expect(decisionResponse.statusCode).toBe(200);
    expect(closed.status).toBe('completed');
    expect(closed.feedback).toMatchObject({
      reviewerId: 'mock_reviewer_001',
      agentDecision: 'MANUAL_REVIEW',
      finalDecision: 'REQUEST_REVISION',
      feedbackType: 'RULE_TOO_BROAD',
      comment: '请删除性别限制后重新提交。',
      falsePositive: false,
      falseNegative: false,
    });

    const addToEvalResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_manual_001/add-to-eval',
      payload: {
        datasetId: 'human_review_feedback_test',
      },
    });
    expect(addToEvalResponse.statusCode).toBe(201);
    expect(addToEvalResponse.json()).toMatchObject({
      imported: 1,
      case: {
        id: 'case_from_review_audit_manual_001',
        expectedDecision: 'MANUAL_REVIEW',
        expectedCategories: ['DISCRIMINATION'],
        metadata: {
          feedbackType: 'RULE_TOO_BROAD',
          agentDecision: 'MANUAL_REVIEW',
          finalDecision: 'REQUEST_REVISION',
        },
      },
    });

    const evalCasesResponse = await app.inject({
      method: 'GET',
      url: '/api/evals/datasets/human_review_feedback_test/cases',
    });
    expect(evalCasesResponse.statusCode).toBe(200);
    expect(evalCasesResponse.json<{ items: unknown[] }>().items).toHaveLength(1);

    const suggestionResponse = await app.inject({
      method: 'POST',
      url: '/api/reviews/audit_manual_001/create-rule-suggestion',
      payload: {
        createdBy: 'mock_reviewer_001',
        feedbackType: 'RULE_TOO_BROAD',
        description: '性别限制规则需要区分特殊岗位例外。',
      },
    });
    expect(suggestionResponse.statusCode).toBe(201);
    const suggestion = suggestionResponse.json();
    expect(suggestion).toMatchObject({
      reviewTicketId: 'audit_manual_001',
      status: 'open',
      feedbackType: 'RULE_TOO_BROAD',
      category: 'DISCRIMINATION',
      ruleId: 'CN_DISCRIMINATION_GENDER_001',
    });

    const suggestionsResponse = await app.inject({
      method: 'GET',
      url: '/api/rule-suggestions?status=open&tenantId=tenant_001',
    });
    expect(suggestionsResponse.statusCode).toBe(200);
    expect(suggestionsResponse.json<{ items: unknown[] }>().items).toHaveLength(1);

    const resolveSuggestionResponse = await app.inject({
      method: 'POST',
      url: `/api/rule-suggestions/${suggestion.id}/resolve`,
      payload: {
        resolvedBy: 'mock_rule_admin',
        resolutionComment: '已进入规则发布流程。',
      },
    });
    expect(resolveSuggestionResponse.statusCode).toBe(200);
    expect(resolveSuggestionResponse.json()).toMatchObject({
      id: suggestion.id,
      status: 'resolved',
      resolvedBy: 'mock_rule_admin',
    });

    const pendingAfterDecision = await app.inject({
      method: 'GET',
      url: '/api/reviews?status=pending&tenantId=tenant_001',
    });
    expect(pendingAfterDecision.json<{ items: HumanReviewTicket[] }>().items).toEqual([]);

    const completedAfterDecision = await app.inject({
      method: 'GET',
      url: '/api/reviews?status=completed&tenantId=tenant_001',
    });
    expect(completedAfterDecision.json<{ items: HumanReviewTicket[] }>().items).toHaveLength(1);
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
