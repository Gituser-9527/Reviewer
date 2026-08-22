import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgresAuditRunRepository, PostgresLearningFeedbackRepository } from '@job-compliance/database';
import { learningFeedbackConsentNoticeVersion, learningFeedbackPurpose, learningFeedbackSource, type AuditResult, type JobPostingInput, type LearningFeedbackSubmission } from '@job-compliance/shared';
import { runRetentionCli } from './retention-cli.js';
import { LearningFeedbackRetentionService } from './retention.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for retention PostgreSQL tests');

describe('learning feedback retention PostgreSQL inspection', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const auditRepository = new PostgresAuditRunRepository({ pool });
  const repository = new PostgresLearningFeedbackRepository({ pool });
  const suffix = randomUUID();
  const tenantId = `tenant-retention-${suffix}`;

  beforeAll(async () => {
    const auditId = `audit-retention-${suffix}`;
    const jobPosting: JobPostingInput = { externalId: `job-retention-${suffix}`, title: 'Retention 测试岗位', description: '人工复核。' };
    const result: AuditResult = { auditId, decision: 'MANUAL_REVIEW', riskLevel: 'HIGH', summary: '需要人工复核。', findings: [], evidence: [], suggestions: [], compliantRewrite: null, checkerResults: [], createdAt: '2026-01-01T00:00:00.000Z', context: { auditId, tenantId, requestId: `request-${suffix}`, jurisdiction: 'CN_MAINLAND', locale: 'zh-CN', platform: 'DEFAULT', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', evaluatedAt: '2026-01-01T00:00:00.000Z' } };
    await auditRepository.saveAuditRun({ tenantId, jobPosting, result });
    const ticket = await auditRepository.createHumanReviewTicket(result, jobPosting);
    if (ticket === undefined) throw new Error('Expected review ticket.');
    await auditRepository.submitHumanReviewDecision(ticket.id, { reviewerId: 'retention-reviewer', finalDecision: 'REQUEST_REVISION', feedbackType: 'VALID_RESULT', comment: '', falsePositive: false, falseNegative: false });
    const persisted = await pool.query<{ id: string }>('SELECT id FROM human_review_feedback WHERE review_ticket_id=$1 AND tenant_id=$2', [ticket.id, tenantId]);
    const decisionId = persisted.rows[0]?.id;
    if (decisionId === undefined) throw new Error('Expected reviewer decision.');
    const record: LearningFeedbackSubmission = { id: `retention-expired-${suffix}`, tenantId, auditRunId: auditId, humanReviewTicketId: ticket.id, reviewerDecisionId: decisionId, source: learningFeedbackSource, status: 'RECEIVED', consentScope: 'TENANT_PRIVATE', consentNoticeVersion: learningFeedbackConsentNoticeVersion, consentedAt: '2026-01-01T00:00:00.000Z', purpose: learningFeedbackPurpose, retentionDays: 30, retentionExpiresAt: '2026-01-01T00:00:00.000Z', reviewerPseudonym: 'a'.repeat(64), pseudonymKeyVersion: 'test-v1', digest: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), sanitizedComment: 'LEARNING_RETENTION_SECRET_179', sanitizedEvidenceFragments: [], redactionSummary: { redactionCount: 0, needsPrivacyReview: false }, agentDecision: 'MANUAL_REVIEW', humanDecision: 'REQUEST_REVISION', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    await repository.createIdempotent(record, { actorPseudonym: 'b'.repeat(64), pseudonymKeyVersion: 'test-v1' });
  });

  afterAll(async () => { try { await pool.query('DELETE FROM learning_feedback_submissions WHERE tenant_id=$1', [tenantId]); await pool.query('DELETE FROM learning_feedback_retention_runs WHERE tenant_id=$1', [tenantId]); await pool.query('DELETE FROM audit_operation_logs WHERE tenant_id=$1', [tenantId]); await pool.query('DELETE FROM audit_runs WHERE tenant_id=$1', [tenantId]); await pool.query('DELETE FROM job_postings WHERE tenant_id=$1', [tenantId]); } finally { await pool.end(); } });

  it('dry-runs tenant policy without deleting submissions or events, including Gold anomalies', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key');
    const before = await pool.query<{ submissions: string; events: string }>('SELECT (SELECT count(*) FROM learning_feedback_submissions WHERE tenant_id=$1)::text AS submissions,(SELECT count(*) FROM learning_feedback_events WHERE tenant_id=$1)::text AS events', [tenantId]);
    const summary = await service.run({ mode: 'DRY_RUN', tenantId, cutoff: new Date('2026-02-01T00:00:00.000Z'), batchLimit: 10, actorUserId: 'maintenance-operator' });
    expect(summary).toMatchObject({ mode: 'DRY_RUN', candidateCount: 1, deletedCount: 0 });
    const after = await pool.query<{ submissions: string; events: string }>('SELECT (SELECT count(*) FROM learning_feedback_submissions WHERE tenant_id=$1)::text AS submissions,(SELECT count(*) FROM learning_feedback_events WHERE tenant_id=$1)::text AS events', [tenantId]);
    expect(after.rows).toEqual(before.rows);
    const stored = await pool.query<{ stored: string }>('SELECT to_jsonb(learning_feedback_retention_runs)::text AS stored FROM learning_feedback_retention_runs WHERE id=$1', [summary.runId]);
    expect(stored.rows[0]?.stored).not.toContain('LEARNING_RETENTION_SECRET_179');
    expect(summary).not.toHaveProperty('candidateIds');
  });

  it('requires explicit cutoff, omits candidate IDs from CLI output, and rejects execute', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const dedicated = { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'maintenance', LEARNING_FEEDBACK_PSEUDONYM_KEY: 'key', LEARNING_FEEDBACK_RETENTION_DATABASE_URL: testDatabaseUrl };
    try {
      await expect(runRetentionCli(['dry-run', '--tenant-id', tenantId], dedicated)).resolves.toBe(1);
      await expect(runRetentionCli(['dry-run', '--tenant-id', tenantId, '--cutoff', '2026-02-01T00:00:00.000Z'], dedicated)).resolves.toBe(0);
      const response = output.mock.calls.at(-1)?.[0]?.toString() ?? '';
      expect(response).not.toContain('candidateIds');
      expect(response).not.toContain('LEARNING_RETENTION_SECRET_179');
      await expect(runRetentionCli(['execute', '--tenant-id', tenantId], dedicated)).resolves.toBe(1);
    } finally {
      output.mockRestore();
    }
  });

  it('does not use generic database URLs', async () => {
    const env = { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'maintenance', LEARNING_FEEDBACK_PSEUDONYM_KEY: 'key', DATABASE_URL: testDatabaseUrl, TEST_DATABASE_URL: testDatabaseUrl };
    await expect(runRetentionCli(['dry-run', '--tenant-id', tenantId], env)).resolves.toBe(1);
  });
});
