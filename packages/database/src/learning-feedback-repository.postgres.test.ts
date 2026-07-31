import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditResult, JobPostingInput, LearningFeedbackSubmission } from '@job-compliance/shared';
import { PostgresLearningFeedbackRepository } from './learning-feedback-repository.js';
import { PostgresAuditRunRepository } from './repository.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for learning feedback PostgreSQL integration tests');

describe('PostgresLearningFeedbackRepository integration', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const auditRepository = new PostgresAuditRunRepository({ pool });
  const feedbackRepository = new PostgresLearningFeedbackRepository({ pool });
  const tenantId = `tenant_learning_${Date.now()}`;
  const auditId = `audit_learning_${Date.now()}`;
  let reviewerDecisionId = '';

  const jobPosting: JobPostingInput = { externalId: `job_learning_${Date.now()}`, title: '审核测试岗位', description: '请人工确认岗位要求。' };
  const result: AuditResult = {
    auditId, decision: 'MANUAL_REVIEW', riskLevel: 'HIGH', summary: '需要人工复核。', findings: [], evidence: [], suggestions: [], compliantRewrite: null, checkerResults: [], createdAt: '2026-01-01T00:00:00.000Z',
    context: { auditId, tenantId, requestId: 'learning-feedback-test', jurisdiction: 'CN_MAINLAND', locale: 'zh-CN', platform: 'DEFAULT', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', evaluatedAt: '2026-01-01T00:00:00.000Z' },
  };

  beforeAll(async () => {
    await auditRepository.saveAuditRun({ tenantId, jobPosting, result });
    const ticket = await auditRepository.createHumanReviewTicket(result, jobPosting);
    if (ticket === undefined) throw new Error('Expected a manual-review ticket.');
    const completed = await auditRepository.submitHumanReviewDecision(ticket.id, { reviewerId: 'reviewer-test', finalDecision: 'REQUEST_REVISION', feedbackType: 'VALID_RESULT', comment: '', falsePositive: false, falseNegative: false });
    reviewerDecisionId = completed?.feedback?.id ?? '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(reviewerDecisionId)) throw new Error('Expected UUID human review feedback id.');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM learning_feedback_submissions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM audit_runs WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM job_postings WHERE tenant_id = $1', [tenantId]);
    await pool.end();
  });

  function record(overrides: Partial<LearningFeedbackSubmission> = {}): LearningFeedbackSubmission {
    const now = '2026-01-01T00:00:00.000Z';
    return { id: `learning_${randomUUID()}`, tenantId, auditRunId: auditId, humanReviewTicketId: auditId, reviewerDecisionId, source: 'WEB', status: 'RECEIVED', consentScope: 'TENANT_PRIVATE', consentNoticeVersion: 'notice-v1', consentedAt: now, purpose: 'quality review', retentionDays: 30, retentionExpiresAt: '2026-01-31T00:00:00.000Z', reviewerPseudonym: 'a'.repeat(64), pseudonymKeyVersion: 'test-v1', digest: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), sanitizedComment: 'sanitized', sanitizedEvidenceFragments: [], redactionSummary: { redactionCount: 0, needsPrivacyReview: false }, agentDecision: 'MANUAL_REVIEW', humanDecision: 'REQUEST_REVISION', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', createdAt: now, updatedAt: now, ...overrides };
  }

  it('has a UUID foreign key and expected quarantine indexes after full migration', async () => {
    const type = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'learning_feedback_submissions' AND column_name = 'reviewer_decision_id'");
    expect(type.rows[0]?.data_type).toBe('uuid');
    const constraints = await pool.query("SELECT conname FROM pg_constraint WHERE conrelid = 'learning_feedback_submissions'::regclass AND contype = 'f'");
    expect(constraints.rows.map((row) => row.conname)).toContain('learning_feedback_submissions_reviewer_decision_id_fkey');
    const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'learning_feedback_submissions'");
    const names = indexes.rows.map((row) => row.indexname);
    expect(names).toEqual(expect.arrayContaining(['learning_feedback_idempotency_idx', 'learning_feedback_tenant_status_idx', 'learning_feedback_retention_idx']));
  });

  it('persists, reads, lists, updates, and enforces the human-review foreign key', async () => {
    const created = await feedbackRepository.create(record());
    await expect(feedbackRepository.findById(created.id, tenantId)).resolves.toMatchObject({ id: created.id, reviewerDecisionId });
    await expect(feedbackRepository.list({ tenantId, status: 'RECEIVED' })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    await expect(feedbackRepository.update({ ...created, status: 'WITHDRAWN', withdrawnAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' })).resolves.toMatchObject({ status: 'WITHDRAWN' });
    await expect(feedbackRepository.create(record({ reviewerDecisionId: '00000000-0000-4000-8000-000000000099' }))).rejects.toMatchObject({ cause: { code: '23503' } });
  });
});
