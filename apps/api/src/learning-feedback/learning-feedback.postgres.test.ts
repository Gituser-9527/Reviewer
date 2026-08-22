import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAuditRunRepository, PostgresLearningFeedbackRepository } from '@job-compliance/database';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import { LLMSettingsService } from '../settings/service.js';
import { LearningFeedbackService } from './service.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for the learning feedback API PostgreSQL test');

describe('learning feedback API PostgreSQL trust chain', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const auditRepository = new PostgresAuditRunRepository({ pool });
  const feedbackRepository = new PostgresLearningFeedbackRepository({ pool });
  const suffix = randomUUID();
  const tenantId = `tenant-api-${suffix}`;
  const auditId = `audit-api-${suffix}`;
  const reviewerA = { 'x-user-role': 'REVIEWER', 'x-user-id': 'trusted-reviewer-a', 'x-tenant-id': tenantId };
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    const jobPosting: JobPostingInput = { externalId: `job-api-${suffix}`, title: '审核测试岗位', description: '请人工确认岗位要求。' };
    const result: AuditResult = {
      auditId,
      decision: 'MANUAL_REVIEW',
      riskLevel: 'HIGH',
      summary: '需要人工复核。',
      findings: [],
      evidence: [],
      suggestions: [],
      compliantRewrite: null,
      checkerResults: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      context: { auditId, tenantId, requestId: `request-${suffix}`, jurisdiction: 'CN_MAINLAND', locale: 'zh-CN', platform: 'DEFAULT', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', evaluatedAt: '2026-01-01T00:00:00.000Z' },
    };
    await auditRepository.saveAuditRun({ tenantId, jobPosting, result });
    await auditRepository.createHumanReviewTicket(result, jobPosting);
    app = buildApp({ learningFeedbackService: new LearningFeedbackService(feedbackRepository, 'test-pseudonym-key'), llmSettingsService: new LLMSettingsService() });
  });

  afterAll(async () => {
    try {
      await app?.close();
      await pool.query('DELETE FROM learning_feedback_submissions WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM audit_runs WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM job_postings WHERE tenant_id = $1', [tenantId]);
    } finally {
      await pool.end();
    }
  });

  it('persists the authenticated reviewer and returns one record for 20 concurrent submits', async () => {
    const decision = await app.inject({
      method: 'POST',
      url: `/api/reviews/${auditId}/decision`,
      headers: reviewerA,
      payload: { reviewerId: 'spoofed-reviewer-b', finalDecision: 'REQUEST_REVISION', feedbackType: 'VALID_RESULT', comment: '人工确认。', falsePositive: false, falseNegative: false },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().feedback.reviewerId).toBe('trusted-reviewer-a');
    const persistedReviewer = await pool.query<{ reviewer_id: string }>('SELECT reviewer_id FROM human_review_feedback WHERE review_ticket_id = $1', [auditId]);
    expect(persistedReviewer.rows).toEqual([{ reviewer_id: 'trusted-reviewer-a' }]);

    const marker = 'LEARNING_SECRET_MARKER_173';
    const sensitive = `Authorization: Bearer ${marker} access_token=${marker} 手机13800138000 邮箱person@example.com 身份证110101199001011234 https://example.test/${marker} 地址北京市朝阳区幸福路88号 postgresql://user:${marker}@localhost/db`;
    const input = { consentScope: 'TENANT_PRIVATE', retentionDays: 30, comment: sensitive, evidenceFragments: [sensitive] };
    const preview = await app.inject({ method: 'POST', url: `/api/reviews/${auditId}/learning-feedback/preview`, headers: reviewerA, payload: input });
    expect(preview.statusCode).toBe(200);
    const responses = await Promise.all(Array.from({ length: 20 }, () => app.inject({
      method: 'POST',
      url: `/api/reviews/${auditId}/learning-feedback`,
      headers: reviewerA,
      payload: { ...input, digest: preview.json().digest, explicitConfirmation: true },
    })));
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    const ids = responses.map((response) => response.json().id as string);
    expect(new Set(ids).size).toBe(1);
    expect(responses.every((response) => !response.body.includes(marker))).toBe(true);
    const count = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM learning_feedback_submissions WHERE tenant_id = $1 AND audit_run_id = $2', [tenantId, auditId]);
    expect(count.rows[0]?.count).toBe('1');
    const persisted = await pool.query<{ source: string; purpose: string; consent_notice_version: string; stored: string }>(`
      SELECT source, purpose, consent_notice_version, to_jsonb(learning_feedback_submissions)::text AS stored
      FROM learning_feedback_submissions WHERE tenant_id = $1 AND audit_run_id = $2
    `, [tenantId, auditId]);
    expect(persisted.rows[0]).toMatchObject({ source: 'API', purpose: 'QUALITY_IMPROVEMENT_REVIEW', consent_notice_version: 'learning-feedback-v1' });
    expect(persisted.rows[0]?.stored).not.toContain(marker);
    expect(persisted.rows[0]?.stored).not.toContain('13800138000');
    expect(persisted.rows[0]?.stored).not.toContain('person@example.com');
    expect(persisted.rows[0]?.stored).not.toContain('110101199001011234');
    expect(persisted.rows[0]?.stored).not.toContain('trusted-reviewer-a');

    const feedbackId = ids[0]!;
    const submittedEvents = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM learning_feedback_events
       WHERE tenant_id = $1 AND learning_feedback_id = $2 AND event_type = 'SUBMITTED'`,
      [tenantId, feedbackId],
    );
    expect(submittedEvents.rows[0]?.count).toBe('1');

    const managerBase = { 'x-user-role': 'COMPLIANCE_MANAGER', 'x-tenant-id': tenantId };
    const [approve, reject] = await Promise.all([
      app.inject({
        method: 'POST', url: `/api/learning-feedback/${feedbackId}/review`,
        headers: { ...managerBase, 'x-user-id': 'manager-a' },
        payload: { status: 'APPROVED', reasonCode: 'QUALITY_VALIDATED', reasonNote: `Authorization: Bearer ${marker}` },
      }),
      app.inject({
        method: 'POST', url: `/api/learning-feedback/${feedbackId}/review`,
        headers: { ...managerBase, 'x-user-id': 'manager-b' },
        payload: { status: 'REJECTED', reasonCode: 'INSUFFICIENT_QUALITY', reasonNote: `access_token=${marker}` },
      }),
    ]);
    expect([approve.statusCode, reject.statusCode].sort()).toEqual([200, 409]);
    const storedReview = await pool.query<{ status: string; event_count: string; event_data: string }>(`
      SELECT submission.status,
             count(event.id) FILTER (WHERE event.event_type IN ('REVIEW_APPROVED', 'REVIEW_REJECTED'))::text AS event_count,
             coalesce(string_agg(event.actor_pseudonym || ' ' || coalesce(event.reason_note_redacted, ''), ' '), '') AS event_data
      FROM learning_feedback_submissions submission
      LEFT JOIN learning_feedback_events event
        ON event.learning_feedback_id = submission.id AND event.tenant_id = submission.tenant_id
      WHERE submission.id = $1 AND submission.tenant_id = $2
      GROUP BY submission.status
    `, [feedbackId, tenantId]);
    expect(['APPROVED', 'REJECTED']).toContain(storedReview.rows[0]?.status);
    expect(storedReview.rows[0]?.event_count).toBe('1');
    expect(storedReview.rows[0]?.event_data).not.toContain(marker);
    expect(storedReview.rows[0]?.event_data).not.toContain('manager-a');
    expect(storedReview.rows[0]?.event_data).not.toContain('manager-b');
  });
});
