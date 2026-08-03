import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  learningFeedbackConsentNoticeVersion,
  learningFeedbackPurpose,
  learningFeedbackSource,
  type AuditResult,
  type HumanReviewTicket,
  type JobPostingInput,
  type LearningFeedbackEvent,
  type LearningFeedbackSubmission,
} from '@job-compliance/shared';
import { PostgresLearningFeedbackRepository } from './learning-feedback-repository.js';
import { PostgresAuditRunRepository } from './repository.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for learning feedback PostgreSQL integration tests');

type Chain = { tenantId: string; auditId: string; ticket: HumanReviewTicket; reviewerDecisionId: string; reviewerId: string };

describe('PostgresLearningFeedbackRepository integration', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const auditRepository = new PostgresAuditRunRepository({ pool });
  const feedbackRepository = new PostgresLearningFeedbackRepository({ pool });
  const prefix = randomUUID();
  const tenants = [`tenant-a-${prefix}`, `tenant-b-${prefix}`];
  let a1: Chain;
  let a2: Chain;
  let b1: Chain;

  async function createChain(tenantId: string, suffix: string, reviewerId: string): Promise<Chain> {
    const auditId = `audit-${suffix}-${prefix}`;
    const jobPosting: JobPostingInput = {
      externalId: `job-${suffix}-${prefix}`,
      title: `审核测试岗位 ${suffix}`,
      description: `请人工确认岗位要求 ${suffix}。`,
    };
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
      context: {
        auditId,
        tenantId,
        requestId: `request-${suffix}`,
        jurisdiction: 'CN_MAINLAND',
        locale: 'zh-CN',
        platform: 'DEFAULT',
        ruleVersion: 'rules-v1',
        lawKbVersion: 'kb-v1',
        evaluatedAt: '2026-01-01T00:00:00.000Z',
      },
    };
    await auditRepository.saveAuditRun({ tenantId, jobPosting, result });
    const ticket = await auditRepository.createHumanReviewTicket(result, jobPosting);
    if (ticket === undefined) throw new Error('Expected a manual-review ticket.');
    const completed = await auditRepository.submitHumanReviewDecision(ticket.id, {
      reviewerId,
      finalDecision: 'REQUEST_REVISION',
      feedbackType: 'VALID_RESULT',
      comment: '',
      falsePositive: false,
      falseNegative: false,
    });
    if (completed === undefined) throw new Error('Expected completed human review ticket.');
    const reviewerDecisionId = completed.feedback?.id;
    if (reviewerDecisionId === undefined) throw new Error('Expected human review feedback.');
    return { tenantId, auditId, ticket: completed, reviewerDecisionId, reviewerId };
  }

  beforeAll(async () => {
    a1 = await createChain(tenants[0]!, 'a1', 'trusted-reviewer-a');
    a2 = await createChain(tenants[0]!, 'a2', 'trusted-reviewer-a2');
    b1 = await createChain(tenants[1]!, 'b1', 'trusted-reviewer-b');
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM learning_feedback_submissions WHERE tenant_id = ANY($1)', [tenants]);
      await pool.query('DELETE FROM audit_runs WHERE tenant_id = ANY($1)', [tenants]);
      await pool.query('DELETE FROM job_postings WHERE tenant_id = ANY($1)', [tenants]);
    } finally {
      await pool.end();
    }
  });

  function record(chain: Chain, overrides: Partial<LearningFeedbackSubmission> = {}): LearningFeedbackSubmission {
    const now = '2026-01-01T00:00:00.000Z';
    return {
      id: `learning-${randomUUID()}`,
      tenantId: chain.tenantId,
      auditRunId: chain.auditId,
      humanReviewTicketId: chain.ticket.id,
      reviewerDecisionId: chain.reviewerDecisionId,
      source: learningFeedbackSource,
      status: 'RECEIVED',
      consentScope: 'TENANT_PRIVATE',
      consentNoticeVersion: learningFeedbackConsentNoticeVersion,
      consentedAt: now,
      purpose: learningFeedbackPurpose,
      retentionDays: 30,
      retentionExpiresAt: '2026-01-31T00:00:00.000Z',
      reviewerPseudonym: 'a'.repeat(64),
      pseudonymKeyVersion: 'test-v1',
      digest: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      sanitizedComment: 'sanitized',
      sanitizedEvidenceFragments: [],
      redactionSummary: { redactionCount: 0, needsPrivacyReview: false },
      agentDecision: 'MANUAL_REVIEW',
      humanDecision: 'REQUEST_REVISION',
      ruleVersion: 'rules-v1',
      lawKbVersion: 'kb-v1',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function event(candidate: LearningFeedbackSubmission, overrides: Partial<LearningFeedbackEvent> = {}): LearningFeedbackEvent {
    return { id: `event-${randomUUID()}`, tenantId: candidate.tenantId, learningFeedbackId: candidate.id, eventType: 'SUBMITTED', toStatus: candidate.status, actorPseudonym: 'b'.repeat(64), pseudonymKeyVersion: 'test-v1', occurredAt: candidate.createdAt, ...overrides };
  }

  async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
    try {
      await promise;
      throw new Error(`Expected PostgreSQL error ${code}`);
    } catch (error) {
      const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
      const actual = (cause as { code?: string } | undefined)?.code ?? (error as { code?: string }).code;
      expect(actual).toBe(code);
    }
  }

  it('declares exact composite chain foreign keys with RESTRICT deletion', async () => {
    const type = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'learning_feedback_submissions' AND column_name = 'reviewer_decision_id'");
    expect(type.rows[0]?.data_type).toBe('uuid');
    const constraints = await pool.query<{ conname: string; definition: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'learning_feedback_submissions'::regclass AND contype = 'f'
      ORDER BY conname
    `);
    expect(Object.fromEntries(constraints.rows.map((row) => [row.conname, row.definition]))).toEqual({
      learning_feedback_audit_tenant_fkey: 'FOREIGN KEY (audit_run_id, tenant_id) REFERENCES audit_runs(id, tenant_id) ON DELETE RESTRICT',
      learning_feedback_decision_chain_fkey: 'FOREIGN KEY (reviewer_decision_id, human_review_ticket_id, audit_run_id, tenant_id) REFERENCES human_review_feedback(id, review_ticket_id, audit_run_id, tenant_id) ON DELETE RESTRICT',
      learning_feedback_ticket_chain_fkey: 'FOREIGN KEY (human_review_ticket_id, audit_run_id, tenant_id) REFERENCES review_tickets(id, audit_run_id, tenant_id) ON DELETE RESTRICT',
    });
    const eventConstraint = await pool.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'learning_feedback_event_submission_tenant_fkey'");
    expect(eventConstraint.rows[0]?.definition).toBe('FOREIGN KEY (learning_feedback_id, tenant_id) REFERENCES learning_feedback_submissions(id, tenant_id) ON DELETE CASCADE');
  });

  it('accepts a valid chain and rejects every tenant, audit, ticket, and decision splice', async () => {
    const valid = record(a1);
    await expect(feedbackRepository.createIdempotent(valid, event(valid))).resolves.toMatchObject({ tenantId: a1.tenantId, reviewerDecisionId: a1.reviewerDecisionId });
    for (const invalid of [record(a1, { reviewerDecisionId: b1.reviewerDecisionId }), record(a1, { auditRunId: a2.auditId }), record(a1, { humanReviewTicketId: a2.ticket.id }), record(a1, { reviewerDecisionId: a2.reviewerDecisionId })]) await expectPgError(feedbackRepository.createIdempotent(invalid, event(invalid)), '23503');
  });

  it('requires tenant scope for reads, owner lookup, and updates', async () => {
    const candidate = record(a1); const created = await feedbackRepository.createIdempotent(candidate, event(candidate));
    await expect(feedbackRepository.findById(created.id, a1.tenantId)).resolves.toMatchObject({ id: created.id });
    await expect(feedbackRepository.findById(created.id, b1.tenantId)).resolves.toBeUndefined();
    await expect(feedbackRepository.findReviewerDecisionOwner(created)).resolves.toBe(a1.reviewerId);
    const changed = { ...created, status: 'WITHDRAWN' as const, withdrawnAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
    await expect(feedbackRepository.withdrawIfQuarantined(changed, b1.tenantId, event(changed, { tenantId: b1.tenantId, eventType: 'WITHDRAWN', fromStatus: 'RECEIVED', toStatus: 'WITHDRAWN' }))).resolves.toBeUndefined();
    await expect(feedbackRepository.findById(created.id, a1.tenantId)).resolves.toMatchObject({ status: 'RECEIVED' });
    await expect(feedbackRepository.withdrawIfQuarantined(changed, a1.tenantId, event(changed, { eventType: 'WITHDRAWN', fromStatus: 'RECEIVED', toStatus: 'WITHDRAWN' }))).resolves.toMatchObject({ status: 'WITHDRAWN' });
  });

  it('atomically returns one row for 20 concurrent identical writes', async () => {
    const candidate = record(a1);
    const submittedEvent = event(candidate);
    const results = await Promise.all(Array.from({ length: 20 }, () => feedbackRepository.createIdempotent(candidate, submittedEvent)));
    expect(new Set(results.map((item) => item.id)).size).toBe(1);
    expect(results.every((item) => item.id === candidate.id)).toBe(true);
    const count = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM learning_feedback_submissions
      WHERE tenant_id = $1 AND reviewer_decision_id = $2 AND digest = $3 AND consent_notice_version = $4
    `, [candidate.tenantId, candidate.reviewerDecisionId, candidate.digest, candidate.consentNoticeVersion]);
    expect(count.rows[0]?.count).toBe('1');
    await expect(feedbackRepository.listEvents(candidate.id, candidate.tenantId)).resolves.toHaveLength(1);
  });

  it('keeps the complete idempotency key and rejects untrusted notice versions', async () => {
    const first = record(a1);
    const secondRecord = record(a1, { digest: first.digest }); const second = await feedbackRepository.createIdempotent(secondRecord, event(secondRecord));
    const thirdRecord = record(b1, { digest: first.digest }); const third = await feedbackRepository.createIdempotent(thirdRecord, event(thirdRecord));
    expect(second.tenantId).toBe(a1.tenantId);
    expect(third.tenantId).toBe(b1.tenantId);
    const invalid = record(a1, { consentNoticeVersion: 'client-injected-version' as typeof learningFeedbackConsentNoticeVersion });
    await expectPgError(feedbackRepository.createIdempotent(invalid, event(invalid)), '23514');
  });

  it('commits one review event with the CAS winner and rejects the concurrent loser', async () => {
    const candidate = record(a1); const created = await feedbackRepository.createIdempotent(candidate, event(candidate));
    const approved = { ...created, status: 'APPROVED' as const, updatedAt: new Date().toISOString() };
    const rejected = { ...created, status: 'REJECTED' as const, updatedAt: new Date().toISOString() };
    const [left, right] = await Promise.all([
      feedbackRepository.reviewIfQuarantined(approved, a1.tenantId, event(approved, { eventType: 'REVIEW_APPROVED', fromStatus: 'RECEIVED', toStatus: 'APPROVED', reasonCode: 'QUALITY_VALIDATED' })),
      feedbackRepository.reviewIfQuarantined(rejected, a1.tenantId, event(rejected, { eventType: 'REVIEW_REJECTED', fromStatus: 'RECEIVED', toStatus: 'REJECTED', reasonCode: 'INSUFFICIENT_QUALITY' })),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const final = await feedbackRepository.findById(created.id, a1.tenantId);
    expect(final?.status).toBe(left?.status ?? right?.status);
    const events = await feedbackRepository.listEvents(created.id, a1.tenantId);
    expect(events.filter((item) => item.eventType.startsWith('REVIEW_'))).toHaveLength(1);
    await expect(feedbackRepository.listEvents(created.id, b1.tenantId)).resolves.toEqual([]);
  });

  it('rolls back the state if the event insert fails', async () => {
    const candidate = record(a1); await feedbackRepository.createIdempotent(candidate, event(candidate, { id: 'event-rollback-anchor' }));
    const approved = { ...candidate, status: 'APPROVED' as const, updatedAt: new Date().toISOString() };
    await expectPgError(feedbackRepository.reviewIfQuarantined(approved, a1.tenantId, event(approved, { id: 'event-rollback-anchor', eventType: 'REVIEW_APPROVED', fromStatus: 'RECEIVED', toStatus: 'APPROVED', reasonCode: 'QUALITY_VALIDATED' })), '23505');
    await expect(feedbackRepository.findById(candidate.id, a1.tenantId)).resolves.toMatchObject({ status: 'RECEIVED' });
  });
});
