import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAuditRunRepository, PostgresLearningFeedbackRepository } from '@job-compliance/database';
import { learningFeedbackConsentNoticeVersion, learningFeedbackPurpose, learningFeedbackSource, type AuditResult, type JobPostingInput, type LearningFeedbackEvent, type LearningFeedbackStatus, type LearningFeedbackSubmission } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import { LLMSettingsService } from '../settings/service.js';
import { LearningFeedbackRetentionService } from './retention.js';
import { LearningFeedbackError, LearningFeedbackService } from './service.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for retention PostgreSQL tests');

describe('learning feedback retention PostgreSQL governance', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const auditRepository = new PostgresAuditRunRepository({ pool });
  const repository = new PostgresLearningFeedbackRepository({ pool });
  const suffix = randomUUID();
  const tenantId = `tenant-retention-${suffix}`;
  const otherTenantId = `tenant-retention-other-${suffix}`;
  const cutoff = new Date('2026-02-01T00:00:00.000Z');
  let chain: { auditId: string; ticketId: string; decisionId: string };
  let otherChain: { auditId: string; ticketId: string; decisionId: string };

  async function createChain(targetTenant: string, name: string) {
    const auditId = `audit-retention-${name}-${suffix}`;
    const jobPosting: JobPostingInput = { externalId: `job-retention-${name}-${suffix}`, title: 'Retention 测试岗位', description: '人工复核。' };
    const result: AuditResult = { auditId, decision: 'MANUAL_REVIEW', riskLevel: 'HIGH', summary: '需要人工复核。', findings: [], evidence: [], suggestions: [], compliantRewrite: null, checkerResults: [], createdAt: '2026-01-01T00:00:00.000Z', context: { auditId, tenantId: targetTenant, requestId: `request-${name}`, jurisdiction: 'CN_MAINLAND', locale: 'zh-CN', platform: 'DEFAULT', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', evaluatedAt: '2026-01-01T00:00:00.000Z' } };
    await auditRepository.saveAuditRun({ tenantId: targetTenant, jobPosting, result });
    const ticket = await auditRepository.createHumanReviewTicket(result, jobPosting);
    if (ticket === undefined) throw new Error('Expected review ticket.');
    const completed = await auditRepository.submitHumanReviewDecision(ticket.id, { reviewerId: 'retention-reviewer', finalDecision: 'REQUEST_REVISION', feedbackType: 'VALID_RESULT', comment: '', falsePositive: false, falseNegative: false });
    const decisionId = completed?.feedback?.id;
    if (decisionId === undefined) throw new Error('Expected reviewer decision.');
    return { auditId, ticketId: ticket.id, decisionId };
  }

  function record(targetTenant: string, targetChain: typeof chain, name: string, status: LearningFeedbackStatus, retentionExpiresAt: string, withdrawnAt?: string): LearningFeedbackSubmission {
    const createdAt = '2026-01-01T00:00:00.000Z';
    return { id: `retention-${name}-${suffix}`, tenantId: targetTenant, auditRunId: targetChain.auditId, humanReviewTicketId: targetChain.ticketId, reviewerDecisionId: targetChain.decisionId, source: learningFeedbackSource, status, consentScope: 'TENANT_PRIVATE', consentNoticeVersion: learningFeedbackConsentNoticeVersion, consentedAt: createdAt, purpose: learningFeedbackPurpose, retentionDays: 30, retentionExpiresAt, reviewerPseudonym: 'a'.repeat(64), pseudonymKeyVersion: 'test-v1', digest: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), sanitizedComment: 'LEARNING_RETENTION_SECRET_174', sanitizedEvidenceFragments: [], redactionSummary: { redactionCount: 0, needsPrivacyReview: false }, agentDecision: 'MANUAL_REVIEW', humanDecision: 'REQUEST_REVISION', createdAt, updatedAt: createdAt, ...(withdrawnAt === undefined ? {} : { withdrawnAt }) };
  }

  function event(candidate: LearningFeedbackSubmission): LearningFeedbackEvent { return { id: `event-${candidate.id}`, tenantId: candidate.tenantId, learningFeedbackId: candidate.id, eventType: 'SUBMITTED', toStatus: candidate.status, actorPseudonym: 'b'.repeat(64), pseudonymKeyVersion: 'test-v1', occurredAt: candidate.createdAt }; }

  async function insert(candidate: LearningFeedbackSubmission) {
    const base = { ...candidate, status: 'RECEIVED' as const, withdrawnAt: undefined };
    delete (base as { withdrawnAt?: string }).withdrawnAt;
    await repository.createIdempotent(base, event(base));
    await pool.query('UPDATE learning_feedback_submissions SET status=$2, retention_expires_at=$3, withdrawn_at=$4, payload=$5 WHERE id=$1 AND tenant_id=$6', [candidate.id, candidate.status, candidate.retentionExpiresAt, candidate.withdrawnAt ?? null, candidate, candidate.tenantId]);
  }

  beforeAll(async () => {
    chain = await createChain(tenantId, 'target');
    otherChain = await createChain(otherTenantId, 'other');
    for (const candidate of [
      record(tenantId, chain, 'expired-received', 'RECEIVED', '2026-01-01T00:00:00.000Z'),
      record(tenantId, chain, 'future-received', 'RECEIVED', '2027-01-01T00:00:00.000Z'),
      record(tenantId, chain, 'expired-needs-review', 'NEEDS_REVIEW', '2026-01-01T00:00:00.000Z'),
      record(tenantId, chain, 'expired-approved', 'APPROVED', '2026-01-01T00:00:00.000Z'),
      record(tenantId, chain, 'expired-rejected', 'REJECTED', '2026-01-01T00:00:00.000Z'),
      record(tenantId, chain, 'expired-privacy', 'PRIVACY_REJECTED', '2026-01-01T00:00:00.000Z'),
      record(tenantId, chain, 'withdrawn-expired', 'WITHDRAWN', '2026-01-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z'),
      record(tenantId, chain, 'withdrawn-future-retention', 'WITHDRAWN', '2027-01-01T00:00:00.000Z', '2026-01-20T00:00:00.000Z'),
      record(tenantId, chain, 'gold-anomaly', 'PROMOTED_TO_GOLD_SET', '2026-01-01T00:00:00.000Z'),
      record(otherTenantId, otherChain, 'other-expired', 'RECEIVED', '2026-01-01T00:00:00.000Z'),
    ]) await insert(candidate);
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM learning_feedback_submissions WHERE tenant_id = ANY($1)', [[tenantId, otherTenantId]]);
      await pool.query('DELETE FROM learning_feedback_retention_runs WHERE tenant_id = ANY($1)', [[tenantId, otherTenantId]]);
      await pool.query('DELETE FROM audit_operation_logs WHERE tenant_id = ANY($1)', [[tenantId, otherTenantId]]);
      await pool.query('DELETE FROM audit_runs WHERE tenant_id = ANY($1)', [[tenantId, otherTenantId]]);
      await pool.query('DELETE FROM job_postings WHERE tenant_id = ANY($1)', [[tenantId, otherTenantId]]);
    } finally { await pool.end(); }
  });

  const command = (mode: 'DRY_RUN' | 'EXECUTE', batchLimit = 100) => ({ mode, tenantId, cutoff, batchLimit, actorUserId: 'maintenance-operator-174', confirm: mode === 'EXECUTE', executeEnabled: mode === 'EXECUTE' });

  it('dry-runs the complete status policy without changing submissions or events', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key', 'retention-v1');
    const before = await pool.query<{ submissions: string; events: string }>('SELECT (SELECT count(*) FROM learning_feedback_submissions WHERE tenant_id=$1)::text AS submissions, (SELECT count(*) FROM learning_feedback_events WHERE tenant_id=$1)::text AS events', [tenantId]);
    const summary = await service.run(command('DRY_RUN'));
    expect(summary).toMatchObject({ candidateCount: 7, deletedCount: 0, anomalyCount: 1 });
    expect(summary.countsByStatus).toMatchObject({ RECEIVED: 1, NEEDS_REVIEW: 1, APPROVED: 1, REJECTED: 1, PRIVACY_REJECTED: 1, WITHDRAWN: 2 });
    const after = await pool.query<{ submissions: string; events: string }>('SELECT (SELECT count(*) FROM learning_feedback_submissions WHERE tenant_id=$1)::text AS submissions, (SELECT count(*) FROM learning_feedback_events WHERE tenant_id=$1)::text AS events', [tenantId]);
    expect(after.rows).toEqual(before.rows);
  });

  it('fails closed on Gold Set anomaly without deleting candidates', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key');
    await expect(service.run(command('EXECUTE'))).rejects.toMatchObject({ code: 'LEARNING_FEEDBACK_RETENTION_ANOMALY' });
    const count = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM learning_feedback_submissions WHERE tenant_id=$1', [tenantId]);
    expect(count.rows[0]?.count).toBe('9');
    await pool.query("DELETE FROM learning_feedback_submissions WHERE tenant_id=$1 AND status='PROMOTED_TO_GOLD_SET'", [tenantId]);
  });

  it('uses bounded concurrent atomic deletes, cascades events and preserves other tenants', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key');
    const [first, second] = await Promise.all([service.run(command('EXECUTE', 3)), service.run(command('EXECUTE', 3))]);
    expect(first.deletedCount + second.deletedCount).toBe(6);
    expect(new Set([...first.candidateIds, ...second.candidateIds]).size).toBe(6);
    const third = await service.run(command('EXECUTE', 3));
    expect(third.deletedCount).toBe(1);
    const repeated = await service.run(command('EXECUTE', 3));
    expect(repeated.deletedCount).toBe(0);
    const remaining = await pool.query<{ id: string }>('SELECT id FROM learning_feedback_submissions WHERE tenant_id=$1 ORDER BY id', [tenantId]);
    expect(remaining.rows.map((row) => row.id)).toEqual([`retention-future-received-${suffix}`]);
    const other = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM learning_feedback_submissions WHERE tenant_id=$1', [otherTenantId]);
    expect(other.rows[0]?.count).toBe('1');
    const removedEvents = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM learning_feedback_events WHERE tenant_id=$1', [tenantId]);
    expect(removedEvents.rows[0]?.count).toBe('1');
    await expect(new LearningFeedbackService(repository, 'retention-key').find(`retention-expired-received-${suffix}`, tenantId)).rejects.toBeInstanceOf(LearningFeedbackError);
    const api = buildApp({ learningFeedbackService: new LearningFeedbackService(repository, 'retention-key'), llmSettingsService: new LLMSettingsService() });
    try {
      const deletedResponse = await api.inject({ method: 'GET', url: `/api/learning-feedback/retention-expired-received-${suffix}`, headers: { 'x-user-role': 'COMPLIANCE_MANAGER', 'x-user-id': 'manager-retention', 'x-tenant-id': tenantId } });
      expect(deletedResponse.statusCode).toBe(404);
    } finally { await api.close(); }
    const runs = await pool.query<{ stored: string }>('SELECT to_jsonb(learning_feedback_retention_runs)::text AS stored FROM learning_feedback_retention_runs WHERE tenant_id=$1', [tenantId]);
    expect(runs.rows.length).toBeGreaterThanOrEqual(4);
    expect(runs.rows.every((row) => !row.stored.includes('LEARNING_RETENTION_SECRET_174'))).toBe(true);
    const audit = await pool.query<{ stored: string }>('SELECT to_jsonb(audit_operation_logs)::text AS stored FROM audit_operation_logs WHERE tenant_id=$1 AND resource_type=$2', [tenantId, 'learning_feedback_retention']);
    expect(audit.rows.every((row) => !row.stored.includes('LEARNING_RETENTION_SECRET_174'))).toBe(true);
  });
});
