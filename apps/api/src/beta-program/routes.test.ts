import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Beta program API routes', () => {
  it('creates a controlled Beta program and manages participants, mode, feedback, reports and checks', async () => {
    const app = buildApp();
    apps.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/beta-programs',
      payload: {
        tenantId: 'tenant_beta_001',
        name: '内部招聘合规审核 Beta',
        mode: 'shadow',
        startDate: '2026-06-26',
        endDate: '2026-07-10',
        scope: '审核员、运营、合规人员受控试用。',
        goals: ['验证准确性', '收集流程反馈'],
        ownerId: 'beta_owner_001',
      },
    });
    const program = createResponse.json<{ id: string; mode: string }>();

    expect(createResponse.statusCode).toBe(201);
    expect(program.mode).toBe('shadow');

    const participantResponse = await app.inject({
      method: 'POST',
      url: `/api/beta-programs/${program.id}/participants`,
      payload: {
        userId: 'reviewer_001',
        displayName: '审核员 A',
        role: 'reviewer',
        email: 'reviewer@example.com',
      },
    });
    expect(participantResponse.statusCode).toBe(201);

    const modeResponse = await app.inject({
      method: 'PATCH',
      url: `/api/beta-programs/${program.id}/mode`,
      payload: {
        mode: 'assist',
      },
    });
    expect(modeResponse.statusCode).toBe(200);
    expect(modeResponse.json()).toMatchObject({ mode: 'assist' });

    const feedbackResponse = await app.inject({
      method: 'POST',
      url: `/api/beta-programs/${program.id}/feedback`,
      payload: {
        reporterId: 'reviewer_001',
        feedbackType: 'bad_evidence',
        severity: 'high',
        title: '依据引用不够清晰',
        description: '样本中 evidence 摘要无法支撑当前解释。',
        relatedAuditRunId: 'audit_beta_001',
      },
    });
    expect(feedbackResponse.statusCode).toBe(201);

    const dailyReportResponse = await app.inject({
      method: 'POST',
      url: `/api/beta-programs/${program.id}/daily-reports`,
      payload: {
        reportDate: '2026-06-26',
        auditsReviewed: 12,
        manualReviewsCompleted: 8,
        summary: '首日试用整体可控，需复核 evidence 展示。',
        nextActions: ['补充依据展示说明'],
        createdBy: 'operator_001',
      },
    });
    expect(dailyReportResponse.statusCode).toBe(201);
    expect(dailyReportResponse.json()).toMatchObject({
      activeParticipants: 1,
      auditsReviewed: 12,
      feedbackOpened: 1,
    });

    const overviewResponse = await app.inject({
      method: 'GET',
      url: `/api/beta-programs/${program.id}`,
    });
    const overview = overviewResponse.json<{
      participants: unknown[];
      feedback: unknown[];
      dailyReports: unknown[];
      goNoGoChecks: Array<{ id: string; checkKey: string; status: string }>;
      goNoGoSummary: { ready: boolean; pending: number };
    }>();

    expect(overviewResponse.statusCode).toBe(200);
    expect(overview.participants).toHaveLength(1);
    expect(overview.feedback).toHaveLength(1);
    expect(overview.dailyReports).toHaveLength(1);
    expect(overview.goNoGoChecks.length).toBeGreaterThanOrEqual(5);
    expect(overview.goNoGoSummary.ready).toBe(false);

    const check = overview.goNoGoChecks[0];
    expect(check).toBeDefined();
    const checkResponse = await app.inject({
      method: 'PATCH',
      url: `/api/beta-programs/${program.id}/go-no-go/${check?.id}`,
      payload: {
        status: 'pass',
        evidence: '已完成确认。',
      },
    });
    expect(checkResponse.statusCode).toBe(200);
    expect(checkResponse.json()).toMatchObject({ status: 'pass' });

    const feedbackListResponse = await app.inject({
      method: 'GET',
      url: `/api/beta-feedback?tenantId=tenant_beta_001&programId=${program.id}`,
    });
    expect(feedbackListResponse.statusCode).toBe(200);
    expect(feedbackListResponse.json<{ items: unknown[] }>().items).toHaveLength(1);
  });
});
