import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  learningFeedbackConsentNoticeVersion,
  learningFeedbackPurpose,
  learningFeedbackSource,
  type AuditResult,
  type HumanReviewTicket,
  type JobPostingInput,
  type LearningFeedbackSubmission,
} from '@job-compliance/shared';
import { PostgresLearningFeedbackRepository } from './learning-feedback-repository.js';
import { PostgresAuditRunRepository } from './repository.js';
import { learningFeedbackEvents, learningFeedbackRetentionRuns, learningFeedbackSubmissions } from './schema.js';

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
    // The public ticket payload is privacy-redacted and must not be reused as a
    // UUID fixture. Read the persisted decision key from the authoritative table.
    const persistedDecision = await pool.query<{ id: string }>('SELECT id FROM human_review_feedback WHERE review_ticket_id=$1 AND tenant_id=$2', [ticket.id, tenantId]);
    const reviewerDecisionId = persistedDecision.rows[0]?.id;
    if (reviewerDecisionId === undefined) throw new Error('Expected persisted human review feedback.');
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

  const createContext = () => ({ actorPseudonym: 'b'.repeat(64), pseudonymKeyVersion: 'test-v1', requestId: 'request-postgres' });

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
    await expect(feedbackRepository.createIdempotent(valid, createContext())).resolves.toMatchObject({ tenantId: a1.tenantId, reviewerDecisionId: a1.reviewerDecisionId });
    for (const invalid of [record(a1, { reviewerDecisionId: b1.reviewerDecisionId }), record(a1, { auditRunId: a2.auditId }), record(a1, { humanReviewTicketId: a2.ticket.id }), record(a1, { reviewerDecisionId: a2.reviewerDecisionId })]) await expectPgError(feedbackRepository.createIdempotent(invalid, createContext()), '23503');
  });

  it('requires tenant scope for reads, owner lookup, and updates', async () => {
    const candidate = record(a1); const created = await feedbackRepository.createIdempotent(candidate, createContext());
    await expect(feedbackRepository.findById(created.id, a1.tenantId)).resolves.toMatchObject({ id: created.id });
    await expect(feedbackRepository.findById(created.id, b1.tenantId)).resolves.toBeUndefined();
    await expect(feedbackRepository.findReviewerDecisionOwner(created)).resolves.toBe(a1.reviewerId);
    await expect(feedbackRepository.transitionQuarantined({ tenantId: b1.tenantId, learningFeedbackId: created.id, targetStatus: 'WITHDRAWN', ...createContext() })).resolves.toBeUndefined();
    await expect(feedbackRepository.findById(created.id, a1.tenantId)).resolves.toMatchObject({ status: 'RECEIVED' });
    await expect(feedbackRepository.transitionQuarantined({ tenantId: a1.tenantId, learningFeedbackId: created.id, targetStatus: 'WITHDRAWN', ...createContext() })).resolves.toMatchObject({ status: 'WITHDRAWN' });
  });

  it('atomically returns one row for 20 concurrent identical writes', async () => {
    const candidate = record(a1);
    const results = await Promise.all(Array.from({ length: 20 }, () => feedbackRepository.createIdempotent(candidate, createContext())));
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
    const secondRecord = record(a1, { digest: first.digest }); const second = await feedbackRepository.createIdempotent(secondRecord, createContext());
    const thirdRecord = record(b1, { digest: first.digest }); const third = await feedbackRepository.createIdempotent(thirdRecord, createContext());
    expect(second.tenantId).toBe(a1.tenantId);
    expect(third.tenantId).toBe(b1.tenantId);
    const invalid = record(a1, { consentNoticeVersion: 'client-injected-version' as typeof learningFeedbackConsentNoticeVersion });
    await expectPgError(feedbackRepository.createIdempotent(invalid, createContext()), '23514');
  });

  it('commits one review event with the CAS winner and rejects the concurrent loser', async () => {
    const candidate = record(a1); const created = await feedbackRepository.createIdempotent(candidate, createContext());
    const [left, right] = await Promise.all([
      feedbackRepository.transitionQuarantined({ tenantId: a1.tenantId, learningFeedbackId: created.id, targetStatus: 'APPROVED', reasonCode: 'QUALITY_VALIDATED', ...createContext() }),
      feedbackRepository.transitionQuarantined({ tenantId: a1.tenantId, learningFeedbackId: created.id, targetStatus: 'REJECTED', reasonCode: 'INSUFFICIENT_QUALITY', ...createContext() }),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const final = await feedbackRepository.findById(created.id, a1.tenantId);
    expect(final?.status).toBe(left?.status ?? right?.status);
    const events = await feedbackRepository.listEvents(created.id, a1.tenantId);
    expect(events.filter((item) => item.eventType.startsWith('REVIEW_'))).toHaveLength(1);
    await expect(feedbackRepository.listEvents(created.id, b1.tenantId)).resolves.toEqual([]);
  });

  it('rolls back the state if the event insert fails', async () => {
    const candidate = record(a1); await feedbackRepository.createIdempotent(candidate, createContext());
    await pool.query("CREATE OR REPLACE FUNCTION reject_learning_feedback_test_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced event failure' USING ERRCODE='23505'; END; $$ LANGUAGE plpgsql");
    await pool.query("CREATE TRIGGER reject_learning_feedback_test_event_trigger BEFORE INSERT ON learning_feedback_events FOR EACH ROW WHEN (NEW.event_type = 'REVIEW_APPROVED') EXECUTE FUNCTION reject_learning_feedback_test_event()");
    await expectPgError(feedbackRepository.transitionQuarantined({ tenantId: a1.tenantId, learningFeedbackId: candidate.id, targetStatus: 'APPROVED', reasonCode: 'QUALITY_VALIDATED', ...createContext() }), '23505');
    await pool.query('DROP TRIGGER reject_learning_feedback_test_event_trigger ON learning_feedback_events');
    await pool.query('DROP FUNCTION reject_learning_feedback_test_event()');
    await expect(feedbackRepository.findById(candidate.id, a1.tenantId)).resolves.toMatchObject({ status: 'RECEIVED' });
  });

  it('derives event truth from the locked database row and ignores hostile event-shaped extras', async () => {
    const candidate = record(a1, { status: 'NEEDS_REVIEW' });
    await feedbackRepository.createIdempotent(candidate, { ...createContext(), requestId: 'x'.repeat(100_000) });
    const command = {
      tenantId: a1.tenantId,
      learningFeedbackId: candidate.id,
      targetStatus: 'APPROVED' as const,
      reasonCode: 'QUALITY_VALIDATED' as const,
      ...createContext(),
      requestId: 'Authorization: Bearer LEARNING_SECRET_176',
      event: { tenantId: b1.tenantId, learningFeedbackId: 'other', eventType: 'REVIEW_REJECTED', fromStatus: 'RECEIVED', toStatus: 'REJECTED' },
    };
    await expect(feedbackRepository.transitionQuarantined(command)).resolves.toMatchObject({ id: candidate.id, status: 'APPROVED' });
    const events = await feedbackRepository.listEvents(candidate.id, a1.tenantId);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ tenantId: a1.tenantId, learningFeedbackId: candidate.id, eventType: 'REVIEW_APPROVED', fromStatus: 'NEEDS_REVIEW', toStatus: 'APPROVED' });
    expect(events.every((item) => !JSON.stringify(item).includes('LEARNING_SECRET_176'))).toBe(true);
    expect(events[0]?.requestId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(events[1]?.requestId).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('orders lifecycle events deterministically by occurred_at then id', async () => {
    const candidate = record(a1);
    await feedbackRepository.createIdempotent(candidate, createContext());
    const timestamp = new Date(candidate.createdAt);
    await pool.query("UPDATE learning_feedback_submissions SET status='WITHDRAWN', updated_at=$2, withdrawn_at=$2, payload=jsonb_set(payload, '{status}', '\"WITHDRAWN\"'::jsonb) WHERE id=$1 AND tenant_id=$3", [candidate.id, timestamp, candidate.tenantId]);
    const eventId = `zz-event-order-${randomUUID()}`;
    await pool.query(`INSERT INTO learning_feedback_events (id,tenant_id,learning_feedback_id,event_type,from_status,to_status,actor_pseudonym,pseudonym_key_version,metadata,occurred_at) VALUES ($1,$2,$3,'WITHDRAWN','RECEIVED','WITHDRAWN',$4,'test-v1','{}'::jsonb,$5)`, [eventId, candidate.tenantId, candidate.id, 'c'.repeat(64), timestamp]);
    const events = await feedbackRepository.listEvents(candidate.id, candidate.tenantId);
    expect(events.map((event) => event.id)).toEqual([...events].map((event) => event.id).sort());
  });

  it('rejects raw SQL events that do not match the persisted lifecycle', async () => {
    const left = record(a1); const right = record(a2);
    await feedbackRepository.createIdempotent(left, createContext());
    await feedbackRepository.createIdempotent(right, createContext());
    const occurredAt = new Date();
    const approved = { ...left, status: 'APPROVED' as const, updatedAt: occurredAt.toISOString() };
    await pool.query('UPDATE learning_feedback_submissions SET status=$3,payload=$4,updated_at=$5 WHERE id=$1 AND tenant_id=$2', [left.id, left.tenantId, 'APPROVED', approved, occurredAt]);
    const insert = (overrides: Record<string, unknown>) => pool.query(`
      INSERT INTO learning_feedback_events
        (id,tenant_id,learning_feedback_id,event_type,from_status,to_status,actor_pseudonym,pseudonym_key_version,reason_code,request_id,occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,'actor','v1',$7,$8,$9)
    `, [
      `raw-${randomUUID()}`, overrides.tenantId ?? left.tenantId, overrides.learningFeedbackId ?? left.id,
      overrides.eventType ?? 'REVIEW_APPROVED', overrides.fromStatus ?? 'RECEIVED', overrides.toStatus ?? 'APPROVED',
      overrides.reasonCode ?? 'QUALITY_VALIDATED', overrides.requestId ?? 'raw-safe', overrides.occurredAt ?? occurredAt,
    ]);
    await expectPgError(insert({ learningFeedbackId: right.id }), '23514');
    await expectPgError(insert({ tenantId: b1.tenantId }), '23503');
    await expectPgError(insert({ eventType: 'REVIEW_REJECTED' }), '23514');
    await expectPgError(insert({ toStatus: 'REJECTED' }), '23514');
    await expectPgError(insert({ fromStatus: 'NEEDS_REVIEW' }), '23514');
    await expectPgError(insert({ reasonCode: 'PRIVACY_CONCERN' }), '23514');
    await expectPgError(insert({ requestId: 'line\nbreak' }), '23514');
    await expectPgError(insert({ requestId: 'x'.repeat(100_000) }), '23514');
  });

  it('installs the event truth trigger and named parity constraints', async () => {
    const trigger = await pool.query<{ name: string; definition: string }>("SELECT tgname AS name, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='learning_feedback_events'::regclass AND NOT tgisinternal");
    expect(trigger.rows.map((row) => row.name)).toContain('learning_feedback_event_truth_trigger');
    expect(trigger.rows.find((row) => row.name === 'learning_feedback_event_truth_trigger')?.definition).toContain('enforce_learning_feedback_event_truth');
    const constraints = await pool.query<{ name: string; definition: string }>("SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('learning_feedback_submissions'::regclass,'learning_feedback_events'::regclass,'learning_feedback_retention_runs'::regclass)");
    expect(constraints.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      'learning_feedback_submissions_source_check', 'learning_feedback_submissions_status_check',
      'learning_feedback_events_event_semantics_check', 'learning_feedback_events_request_id_check',
      'learning_feedback_retention_runs_run_status_check', 'learning_feedback_retention_runs_failure_code_check',
    ]));
    const drizzleChecks = [learningFeedbackSubmissions, learningFeedbackEvents, learningFeedbackRetentionRuns]
      .flatMap((table) => getTableConfig(table).checks.map((item) => item.name));
    for (const name of constraints.rows.map((row) => row.name).filter((name) => name.startsWith('learning_feedback_') && name.endsWith('_check'))) {
      expect(drizzleChecks).toContain(name);
    }
    const failure = constraints.rows.find((row) => row.name === 'learning_feedback_retention_runs_failure_code_check');
    expect(failure?.definition).toContain("run_status = 'SUCCEEDED'");
    const foreignKeys = await pool.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND conrelid='learning_feedback_events'::regclass");
    expect(foreignKeys.rows.some((row) => row.definition.includes('learning_feedback_submissions'))).toBe(true);
    const indexes = await pool.query<{ definition: string }>("SELECT indexdef AS definition FROM pg_indexes WHERE tablename='learning_feedback_events'");
    expect(indexes.rows.some((row) => row.definition.includes('learning_feedback_events_tenant_feedback_idx'))).toBe(true);
  });
});
