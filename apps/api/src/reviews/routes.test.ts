import { afterEach, describe, expect, it } from 'vitest';
import type { AuditResult, HumanReviewTicket } from '@job-compliance/shared';
import { InMemoryAuditRunStore } from '../audit/store.js';
import { buildApp } from '../app.js';
import { InMemoryEvalStore } from '../evals/store.js';
import { InMemoryLearningFeedbackRepository, LearningFeedbackService } from '../learning-feedback/service.js';
import { InMemoryHumanReviewStore } from './store.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

const result: AuditResult = {
  auditId: 'trusted-review-chain-173',
  decision: 'MANUAL_REVIEW',
  riskLevel: 'HIGH',
  summary: '需要人工复核。',
  findings: [],
  evidence: [],
  suggestions: [],
  compliantRewrite: null,
  checkerResults: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  context: {
    auditId: 'trusted-review-chain-173',
    tenantId: 'tenant-trusted-173',
    requestId: 'request-trusted-173',
    jurisdiction: 'CN_MAINLAND',
    locale: 'zh-CN',
    platform: 'DEFAULT',
    ruleVersion: 'rules-v1',
    lawKbVersion: 'kb-v1',
    evaluatedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('human review trusted identity chain', () => {
  it('ignores a spoofed reviewerId and allows only the authenticated decision owner to submit feedback', async () => {
    const auditRunStore = new InMemoryAuditRunStore();
    const reviewStore = new InMemoryHumanReviewStore();
    const repository = new InMemoryLearningFeedbackRepository();
    auditRunStore.save(result);
    reviewStore.createFromAuditResult(result);
    const app = buildApp({
      auditRunStore,
      reviewStore,
      evalStore: new InMemoryEvalStore(),
      learningFeedbackService: new LearningFeedbackService(repository, 'test-key'),
    });
    apps.push(app);
    const reviewerA = { 'x-user-role': 'REVIEWER', 'x-user-id': 'reviewer-a', 'x-tenant-id': result.context.tenantId };
    const reviewerB = { 'x-user-role': 'REVIEWER', 'x-user-id': 'reviewer-b', 'x-tenant-id': result.context.tenantId };
    const decision = await app.inject({
      method: 'POST',
      url: `/api/reviews/${result.auditId}/decision`,
      headers: reviewerA,
      payload: {
        reviewerId: 'reviewer-b',
        finalDecision: 'REQUEST_REVISION',
        feedbackType: 'VALID_RESULT',
        comment: '人工确认。',
        falsePositive: false,
        falseNegative: false,
      },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json<HumanReviewTicket>().feedback?.reviewerId).toBe('reviewer-a');

    const feedbackInput = { consentScope: 'TENANT_PRIVATE', retentionDays: 30, comment: '安全评论', evidenceFragments: [] };
    const preview = await app.inject({ method: 'POST', url: `/api/reviews/${result.auditId}/learning-feedback/preview`, headers: reviewerA, payload: feedbackInput });
    expect(preview.statusCode).toBe(200);
    const submitA = await app.inject({ method: 'POST', url: `/api/reviews/${result.auditId}/learning-feedback`, headers: reviewerA, payload: { ...feedbackInput, digest: preview.json().digest, explicitConfirmation: true } });
    expect(submitA.statusCode).toBe(201);
    const submitB = await app.inject({ method: 'POST', url: `/api/reviews/${result.auditId}/learning-feedback`, headers: reviewerB, payload: { ...feedbackInput, digest: preview.json().digest, explicitConfirmation: true } });
    expect(submitB.statusCode).toBe(403);
    expect(submitB.json().error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(await repository.list({ tenantId: result.context.tenantId, status: 'all' }))).not.toContain('reviewer-a');
  });
});
