import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAuditRunRepository, PostgresLearningFeedbackRepository, PostgresLearningFeedbackRetentionMaintenanceAdapter } from '@job-compliance/database';
import { learningFeedbackConsentNoticeVersion, learningFeedbackPurpose, learningFeedbackSource, type AuditResult, type JobPostingInput, type LearningFeedbackStatus, type LearningFeedbackSubmission } from '@job-compliance/shared';
import { buildApp } from '../app.js';
import { LLMSettingsService } from '../settings/service.js';
import { runRetentionCli } from './retention-cli.js';
import { buildRetentionConfirmationTarget, LearningFeedbackRetentionService, type RetentionCommand } from './retention.js';
import { LearningFeedbackError, LearningFeedbackService } from './service.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for retention PostgreSQL tests');

describe('learning feedback retention PostgreSQL governance', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const auditRepository = new PostgresAuditRunRepository({ pool });
  const repository = new PostgresLearningFeedbackRepository({ pool });
  const maintenance = new PostgresLearningFeedbackRetentionMaintenanceAdapter(repository, 'test_user');
  const suffix = randomUUID();
  const tenantId = `tenant-retention-${suffix}`;
  const otherTenantId = `tenant-retention-other-${suffix}`;
  const raceTenantId = `tenant-retention-race-${suffix}`;
  const cliTenantId = `tenant-retention-cli-${suffix}`;
  const cutoff = new Date('2026-02-01T00:00:00.000Z');
  let chain: { auditId: string; ticketId: string; decisionId: string };
  let otherChain: { auditId: string; ticketId: string; decisionId: string };
  let raceChain: { auditId: string; ticketId: string; decisionId: string };

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

  async function insert(candidate: LearningFeedbackSubmission) {
    const base = { ...candidate, status: 'RECEIVED' as const, withdrawnAt: undefined };
    delete (base as { withdrawnAt?: string }).withdrawnAt;
    await repository.createIdempotent(base, { actorPseudonym: 'b'.repeat(64), pseudonymKeyVersion: 'test-v1', requestId: 'retention-test' });
    await pool.query('UPDATE learning_feedback_submissions SET status=$2, retention_expires_at=$3, withdrawn_at=$4, payload=$5 WHERE id=$1 AND tenant_id=$6', [candidate.id, candidate.status, candidate.retentionExpiresAt, candidate.withdrawnAt ?? null, candidate, candidate.tenantId]);
  }

  beforeAll(async () => {
    chain = await createChain(tenantId, 'target');
    otherChain = await createChain(otherTenantId, 'other');
    raceChain = await createChain(raceTenantId, 'race');
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
      const cleanupTenants = [tenantId, otherTenantId, raceTenantId, cliTenantId];
      await pool.query('DELETE FROM learning_feedback_submissions WHERE tenant_id = ANY($1)', [cleanupTenants]);
      await pool.query('DELETE FROM learning_feedback_retention_runs WHERE tenant_id = ANY($1)', [cleanupTenants]);
      await pool.query('DELETE FROM audit_operation_logs WHERE tenant_id = ANY($1)', [cleanupTenants]);
      await pool.query('DELETE FROM audit_runs WHERE tenant_id = ANY($1)', [cleanupTenants]);
      await pool.query('DELETE FROM job_postings WHERE tenant_id = ANY($1)', [cleanupTenants]);
    } finally { await pool.end(); }
  });

  const command = (mode: 'DRY_RUN' | 'EXECUTE', batchLimit = 100, targetTenant = tenantId): RetentionCommand => {
    const base: RetentionCommand = { mode, tenantId: targetTenant, cutoff, batchLimit, actorUserId: 'maintenance-operator-174', environment: 'test', databaseName: 'job_compliance_test', databaseEndpoint: '127.0.0.1:5433', confirm: mode === 'EXECUTE', executeEnabled: mode === 'EXECUTE' };
    return mode === 'EXECUTE' ? { ...base, confirmationTarget: buildRetentionConfirmationTarget(base) } : base;
  };

  it('dry-runs the complete status policy without changing submissions or events', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key', 'retention-v1', maintenance);
    const before = await pool.query<{ submissions: string; events: string }>('SELECT (SELECT count(*) FROM learning_feedback_submissions WHERE tenant_id=$1)::text AS submissions, (SELECT count(*) FROM learning_feedback_events WHERE tenant_id=$1)::text AS events', [tenantId]);
    const summary = await service.run(command('DRY_RUN'));
    expect(summary).toMatchObject({ candidateCount: 7, deletedCount: 0, anomalyCount: 1 });
    expect(summary.countsByStatus).toMatchObject({ RECEIVED: 1, NEEDS_REVIEW: 1, APPROVED: 1, REJECTED: 1, PRIVACY_REJECTED: 1, WITHDRAWN: 2 });
    const after = await pool.query<{ submissions: string; events: string }>('SELECT (SELECT count(*) FROM learning_feedback_submissions WHERE tenant_id=$1)::text AS submissions, (SELECT count(*) FROM learning_feedback_events WHERE tenant_id=$1)::text AS events', [tenantId]);
    expect(after.rows).toEqual(before.rows);
  });

  it('fails closed on Gold Set anomaly without deleting candidates', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key', 'v1', maintenance);
    const anomaly = await service.run(command('EXECUTE'));
    expect(anomaly).toMatchObject({ status: 'ANOMALY', failureCode: 'GOLD_SET_ANOMALY', deletedCount: 0 });
    const count = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM learning_feedback_submissions WHERE tenant_id=$1', [tenantId]);
    expect(count.rows[0]?.count).toBe('9');
    const repeated = await service.run(command('EXECUTE'));
    expect(repeated).toMatchObject({ status: 'ANOMALY', deletedCount: 0 });
    expect(repeated.runId).not.toBe(anomaly.runId);
    const runs = await pool.query<{ id: string; run_status: string; deleted_count: number }>('SELECT id,run_status,deleted_count FROM learning_feedback_retention_runs WHERE id=ANY($1)', [[anomaly.runId, repeated.runId]]);
    expect(runs.rows).toHaveLength(2);
    expect(runs.rows.every((row) => row.run_status === 'ANOMALY' && row.deleted_count === 0)).toBe(true);
    const audits = await pool.query<{ resource_id: string; stored: string }>("SELECT resource_id,to_jsonb(audit_operation_logs)::text AS stored FROM audit_operation_logs WHERE resource_id=ANY($1)", [[anomaly.runId, repeated.runId]]);
    expect(audits.rows.map((row) => row.resource_id).sort()).toEqual([anomaly.runId, repeated.runId].sort());
    expect(audits.rows.every((row) => !row.stored.includes('LEARNING_RETENTION_SECRET_174'))).toBe(true);
    await pool.query("DELETE FROM learning_feedback_submissions WHERE tenant_id=$1 AND status='PROMOTED_TO_GOLD_SET'", [tenantId]);
  });

  it('linearizes transition and Retention so the same record cannot be both transitioned and deleted', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key', 'v1', maintenance);
    const transitionFirst = record(raceTenantId, raceChain, 'transition-first', 'RECEIVED', '2026-01-01T00:00:00.000Z');
    await insert(transitionFirst);
    await pool.query(`CREATE OR REPLACE FUNCTION delay_transition_176() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER delay_transition_176_trigger BEFORE UPDATE ON learning_feedback_submissions FOR EACH ROW WHEN (NEW.id = '${transitionFirst.id}') EXECUTE FUNCTION delay_transition_176()`);
    const transitionPromise = repository.transitionQuarantined({ tenantId: raceTenantId, learningFeedbackId: transitionFirst.id, targetStatus: 'WITHDRAWN', actorPseudonym: 'c'.repeat(64), pseudonymKeyVersion: 'v1' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const retentionAfter = await service.run(command('EXECUTE', 100, raceTenantId));
    const transitioned = await transitionPromise;
    await pool.query('DROP TRIGGER delay_transition_176_trigger ON learning_feedback_submissions');
    await pool.query('DROP FUNCTION delay_transition_176()');
    expect(transitioned?.status).toBe('WITHDRAWN');
    expect(retentionAfter.candidateIds).not.toContain(transitionFirst.id);
    await expect(repository.findById(transitionFirst.id, raceTenantId)).resolves.toMatchObject({ status: 'WITHDRAWN' });

    const retentionFirst = record(raceTenantId, raceChain, 'retention-first', 'RECEIVED', '2026-01-01T00:00:00.000Z');
    await insert(retentionFirst);
    await pool.query(`CREATE OR REPLACE FUNCTION delay_delete_176() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN OLD; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER delay_delete_176_trigger BEFORE DELETE ON learning_feedback_submissions FOR EACH ROW WHEN (OLD.id = '${retentionFirst.id}') EXECUTE FUNCTION delay_delete_176()`);
    const executeCommand = command('EXECUTE', 100, raceTenantId);
    const deletePromise = service.run(executeCommand);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const reviewPromise = repository.transitionQuarantined({ tenantId: raceTenantId, learningFeedbackId: retentionFirst.id, targetStatus: 'APPROVED', reasonCode: 'QUALITY_VALIDATED', actorPseudonym: 'd'.repeat(64), pseudonymKeyVersion: 'v1' });
    const [deleted, reviewed] = await Promise.all([deletePromise, reviewPromise]);
    await pool.query('DROP TRIGGER delay_delete_176_trigger ON learning_feedback_submissions');
    await pool.query('DROP FUNCTION delay_delete_176()');
    expect(deleted.candidateIds).toContain(retentionFirst.id);
    expect(reviewed).toBeUndefined();
    await expect(repository.findById(retentionFirst.id, raceTenantId)).resolves.toBeUndefined();
  });

  it('uses only the dedicated Retention URL and rejects production or mismatched targets', async () => {
    const cutoffValue = '2026-02-01T00:00:00.000Z';
    const identity = await maintenance.getDatabaseIdentity();
    const targetBase = { tenantId: cliTenantId, cutoff: new Date(cutoffValue), batchLimit: 3, environment: 'test' as const, databaseName: identity.databaseName, databaseEndpoint: identity.endpoint };
    const target = buildRetentionConfirmationTarget(targetBase);
    const common = { LEARNING_FEEDBACK_RETENTION_ACTOR_ID: 'cli-operator', LEARNING_FEEDBACK_RETENTION_DATABASE_ROLE: 'test_user', LEARNING_FEEDBACK_RETENTION_PSEUDONYM_KEY: undefined, LEARNING_FEEDBACK_PSEUDONYM_KEY: 'cli-key', LEARNING_FEEDBACK_RETENTION_ENVIRONMENT: 'test', LEARNING_FEEDBACK_RETENTION_EXECUTE_ENABLED: 'true' };
    await expect(runRetentionCli(['dry-run', '--tenant-id', cliTenantId], { ...common, DATABASE_URL: testDatabaseUrl })).resolves.toBe(1);
    await expect(runRetentionCli(['dry-run', '--tenant-id', cliTenantId], { ...common, TEST_DATABASE_URL: testDatabaseUrl })).resolves.toBe(1);
    await expect(runRetentionCli(['dry-run', '--tenant-id', cliTenantId, '--limit', '3', '--cutoff', cutoffValue], { ...common, LEARNING_FEEDBACK_RETENTION_DATABASE_URL: testDatabaseUrl, DATABASE_URL: 'postgresql://invalid.invalid/should-not-be-used' })).resolves.toBe(0);
    await expect(runRetentionCli(['execute', '--tenant-id', cliTenantId, '--limit', '3', '--cutoff', cutoffValue, '--confirm', '--confirm-target', 'wrong'], { ...common, LEARNING_FEEDBACK_RETENTION_DATABASE_URL: testDatabaseUrl })).resolves.toBe(1);
    await expect(runRetentionCli(['execute', '--tenant-id', cliTenantId, '--limit', '3', '--cutoff', cutoffValue, '--confirm', '--confirm-target', target], { ...common, LEARNING_FEEDBACK_RETENTION_DATABASE_URL: testDatabaseUrl, LEARNING_FEEDBACK_RETENTION_ENVIRONMENT: 'production' })).resolves.toBe(1);
    await expect(runRetentionCli(['execute', '--tenant-id', cliTenantId, '--limit', '3', '--cutoff', cutoffValue, '--confirm', '--confirm-target', target], { ...common, LEARNING_FEEDBACK_RETENTION_DATABASE_URL: testDatabaseUrl })).resolves.toBe(0);
  });

  it('rolls back deletion and does not claim anomaly audit success when the authoritative writer fails', async () => {
    const candidate = record(raceTenantId, raceChain, 'audit-writer-failure', 'RECEIVED', '2026-01-01T00:00:00.000Z');
    await insert(candidate);
    const failingRepository = new PostgresLearningFeedbackRepository({ pool, auditLogWriter: { recordRetentionWithClient: async () => { throw new Error('AUDIT_WRITER_FAILED'); } } });
    const input = (runId: string) => ({ runId, tenantId: raceTenantId, cutoff, batchLimit: 10, actorPseudonym: 'e'.repeat(64), pseudonymKeyVersion: 'v1', auditActorId: 'maintenance', occurredAt: new Date() });
    const failingMaintenance = new PostgresLearningFeedbackRetentionMaintenanceAdapter(failingRepository, 'test_user');
    await expect(failingMaintenance.executeRetention(input('run-delete-failure-176'))).rejects.toThrow('LEARNING_FEEDBACK_RETENTION_FAILURE_AUDIT_UNAVAILABLE');
    await expect(repository.findById(candidate.id, raceTenantId)).resolves.toMatchObject({ id: candidate.id });
    const gold = record(raceTenantId, raceChain, 'audit-writer-gold', 'PROMOTED_TO_GOLD_SET', '2026-01-01T00:00:00.000Z');
    await insert(gold);
    await expect(failingMaintenance.executeRetention(input('run-anomaly-failure-176'))).rejects.toThrow('LEARNING_FEEDBACK_RETENTION_FAILURE_AUDIT_UNAVAILABLE');
    const run = await pool.query('SELECT id FROM learning_feedback_retention_runs WHERE id=$1', ['run-anomaly-failure-176']);
    expect(run.rowCount).toBe(0);
    await expect(repository.findById(gold.id, raceTenantId)).resolves.toMatchObject({ status: 'PROMOTED_TO_GOLD_SET' });
  });

  it('uses bounded concurrent atomic deletes, cascades events and preserves other tenants', async () => {
    const service = new LearningFeedbackRetentionService(repository, 'retention-key', 'v1', maintenance);
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
