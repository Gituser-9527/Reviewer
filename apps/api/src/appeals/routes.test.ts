import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const auditRequest = {
  tenantId: 'tenant_appeal',
  jobPostingId: 'job_appeal_001',
  company: {
    name: '某某科技有限公司',
  },
  job: {
    title: '行政专员',
    description: '招聘行政专员，限女性，入职需缴纳500元服装费。',
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

describe('appeal review agent routes', () => {
  it('supports appeal submission, agent report, human review, eval feedback and rule suggestion', async () => {
    const app = buildApp();
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest,
    });
    expect(auditResponse.statusCode).toBe(201);
    const audit = auditResponse.json<AuditResult>();
    expect(audit.decision).toBe('REJECT');

    const createAppealResponse = await app.inject({
      method: 'POST',
      url: '/api/appeals',
      headers: {
        'x-user-id': 'tenant_admin_appeal',
        'x-user-role': 'TENANT_ADMIN',
        'x-tenant-id': 'tenant_appeal',
      },
      payload: {
        tenantId: 'tenant_appeal',
        auditRunId: audit.auditId,
        submitterId: 'enterprise_user_001',
        reasonType: 'UPDATED_POSTING',
        reasonText: '我们已删除相关表述，联系人手机号13812345678。',
        supplementalText: '新版文案：招聘行政专员，负责行政支持工作。',
      },
    });
    expect(createAppealResponse.statusCode).toBe(201);
    expect(createAppealResponse.body).not.toContain('13812345678');
    const appeal = createAppealResponse.json<{ id: string; status: string }>();
    expect(appeal.status).toBe('submitted');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/appeals?tenantId=tenant_appeal&status=submitted',
      headers: {
        'x-user-id': 'reviewer_appeal',
        'x-user-role': 'REVIEWER',
        'x-tenant-id': 'tenant_appeal',
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<{ items: unknown[] }>().items).toHaveLength(1);

    const messageResponse = await app.inject({
      method: 'POST',
      url: `/api/appeals/${appeal.id}/messages`,
      headers: {
        'x-user-id': 'tenant_admin_appeal',
        'x-user-role': 'TENANT_ADMIN',
        'x-tenant-id': 'tenant_appeal',
      },
      payload: {
        senderType: 'enterprise',
        senderId: 'enterprise_user_001',
        message: '补充说明：该岗位不再设置性别条件。',
      },
    });
    expect(messageResponse.statusCode).toBe(201);

    const reportResponse = await app.inject({
      method: 'POST',
      url: `/api/appeals/${appeal.id}/agent-report`,
      headers: {
        'x-user-id': 'reviewer_appeal',
        'x-user-role': 'REVIEWER',
        'x-tenant-id': 'tenant_appeal',
      },
    });
    expect(reportResponse.statusCode).toBe(201);
    const report = reportResponse.json<{
      maintainReasons: string[];
      overturnReasons: string[];
      recommendation: string;
    }>();
    expect(report.maintainReasons.length).toBeGreaterThan(0);
    expect(report.overturnReasons.length).toBeGreaterThan(0);
    expect(report.recommendation).toBe('REQUEST_REVISION');

    const detailAfterReportResponse = await app.inject({
      method: 'GET',
      url: `/api/appeals/${appeal.id}`,
      headers: {
        'x-user-id': 'reviewer_appeal',
        'x-user-role': 'REVIEWER',
        'x-tenant-id': 'tenant_appeal',
      },
    });
    expect(detailAfterReportResponse.statusCode).toBe(200);
    expect(detailAfterReportResponse.json()).toMatchObject({
      id: appeal.id,
      status: 'agent_reported',
      originalDecision: 'REJECT',
      agentReport: {
        recommendation: 'REQUEST_REVISION',
      },
    });
    expect(detailAfterReportResponse.json()).not.toHaveProperty('reviewResult');

    const reviewResultResponse = await app.inject({
      method: 'POST',
      url: `/api/appeals/${appeal.id}/review-result`,
      headers: {
        'x-user-id': 'reviewer_appeal',
        'x-user-role': 'REVIEWER',
        'x-tenant-id': 'tenant_appeal',
      },
      payload: {
        reviewerId: 'reviewer_appeal',
        finalDecision: 'OVERTURN',
        comment: '企业已提供修改后文案，本次申诉成功，原拦截建议撤销。',
      },
    });
    expect(reviewResultResponse.statusCode).toBe(200);
    expect(reviewResultResponse.json()).toMatchObject({
      appealCaseId: appeal.id,
      finalDecision: 'OVERTURN',
    });

    const addToEvalResponse = await app.inject({
      method: 'POST',
      url: `/api/appeals/${appeal.id}/add-to-eval`,
      payload: {
        datasetId: 'appeal_feedback_test',
      },
    });
    expect(addToEvalResponse.statusCode).toBe(201);
    expect(addToEvalResponse.json()).toMatchObject({
      imported: 1,
      case: {
        id: `case_from_appeal_${appeal.id}`,
        expectedDecision: 'PASS',
        metadata: {
          appealCaseId: appeal.id,
          finalDecision: 'OVERTURN',
          originalDecision: 'REJECT',
        },
      },
    });

    const createSuggestionResponse = await app.inject({
      method: 'POST',
      url: `/api/appeals/${appeal.id}/create-rule-suggestion`,
      headers: {
        'x-user-id': 'reviewer_appeal',
        'x-user-role': 'REVIEWER',
        'x-tenant-id': 'tenant_appeal',
      },
      payload: {
        createdBy: 'reviewer_appeal',
        description: '更新后文案申诉成功样本应加入规则回归测试。',
      },
    });
    expect(createSuggestionResponse.statusCode).toBe(201);
    expect(createSuggestionResponse.json()).toMatchObject({
      reviewTicketId: appeal.id,
      auditRunId: audit.auditId,
      tenantId: 'tenant_appeal',
      feedbackType: 'FALSE_POSITIVE',
      status: 'open',
    });

    const suggestionsResponse = await app.inject({
      method: 'GET',
      url: '/api/appeals/rule-suggestions?tenantId=tenant_appeal',
      headers: {
        'x-user-id': 'reviewer_appeal',
        'x-user-role': 'REVIEWER',
        'x-tenant-id': 'tenant_appeal',
      },
    });
    expect(suggestionsResponse.statusCode).toBe(200);
    expect(suggestionsResponse.json<{ items: unknown[] }>().items).toHaveLength(1);
  });

  it('does not allow Appeal Agent reports to replace the human final decision', async () => {
    const app = buildApp();
    apps.push(app);

    const auditResponse = await app.inject({
      method: 'POST',
      url: '/api/audit/job',
      payload: auditRequest,
    });
    const audit = auditResponse.json<AuditResult>();

    const appealResponse = await app.inject({
      method: 'POST',
      url: '/api/appeals',
      payload: {
        tenantId: 'tenant_appeal',
        auditRunId: audit.auditId,
        submitterId: 'enterprise_user_001',
        reasonType: 'RULE_NOT_APPLICABLE',
        reasonText: '认为规则不适用。',
      },
    });
    const appeal = appealResponse.json<{ id: string }>();

    await app.inject({
      method: 'POST',
      url: `/api/appeals/${appeal.id}/agent-report`,
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/appeals/${appeal.id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json();
    expect(detail.agentReport).toBeDefined();
    expect(detail.reviewResult).toBeUndefined();
    expect(detail.status).toBe('agent_reported');
  });
});
