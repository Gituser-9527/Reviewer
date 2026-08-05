import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';
import { sanitizeCorrelationId, sanitizeSensitiveText } from '@job-compliance/core';
import {
  isLearningFeedbackReviewReasonAllowed,
  learningFeedbackRetentionExpiryStatuses,
  type LearningFeedbackEvent,
  type LearningFeedbackReviewReasonCode,
  type LearningFeedbackRetentionSummary,
  type LearningFeedbackStatus,
  type LearningFeedbackSubmission,
} from '@job-compliance/shared';
import { PostgresAuditLogWriter, type TransactionalAuditLogWriter } from './audit-log-writer.js';
import {
  humanReviewFeedback,
  learningFeedbackEvents,
  learningFeedbackSubmissions,
} from './schema.js';
import * as schema from './schema.js';

const { Pool } = pg;

export interface RetentionOperationInput {
  runId: string;
  tenantId: string;
  cutoff: Date;
  batchLimit: number;
  actorPseudonym: string;
  pseudonymKeyVersion: string;
  auditActorId: string;
  occurredAt: Date;
}

type RetentionExecutionInput = RetentionOperationInput & { operationStartedAt: Date };

export interface LearningFeedbackCreateContext {
  actorPseudonym: string;
  pseudonymKeyVersion: string;
  requestId?: string;
}

export interface LearningFeedbackTransitionCommand extends LearningFeedbackCreateContext {
  tenantId: string;
  learningFeedbackId: string;
  targetStatus: 'WITHDRAWN' | 'APPROVED' | 'REJECTED';
  reasonCode?: LearningFeedbackReviewReasonCode;
  reasonNoteRedacted?: string;
}

export interface LearningFeedbackRepository {
  createIdempotent(record: LearningFeedbackSubmission, context: LearningFeedbackCreateContext): Promise<LearningFeedbackSubmission>;
  findById(id: string, tenantId: string): Promise<LearningFeedbackSubmission | undefined>;
  findReviewerDecisionOwner(input: { tenantId: string; auditRunId: string; humanReviewTicketId: string; reviewerDecisionId: string }): Promise<string | undefined>;
  list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }): Promise<LearningFeedbackSubmission[]>;
  listEvents(learningFeedbackId: string, tenantId: string): Promise<LearningFeedbackEvent[]>;
  transitionQuarantined(command: LearningFeedbackTransitionCommand): Promise<LearningFeedbackSubmission | undefined>;
  previewRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary>;
  executeRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary>;
  close(): Promise<void>;
}

export class PostgresLearningFeedbackRepository implements LearningFeedbackRepository {
  private readonly pool: PgPool;
  private readonly db: NodePgDatabase<typeof schema>;
  private readonly ownsPool: boolean;
  private readonly auditLogWriter: TransactionalAuditLogWriter;

  constructor(options: { connectionString?: string; pool?: PgPool; auditLogWriter?: TransactionalAuditLogWriter }) {
    if (options.pool === undefined && options.connectionString === undefined) throw new Error('PostgresLearningFeedbackRepository requires a pool or connectionString.');
    this.pool = options.pool ?? new Pool({ connectionString: options.connectionString });
    this.db = drizzle(this.pool, { schema });
    this.ownsPool = options.pool === undefined;
    this.auditLogWriter = options.auditLogWriter ?? new PostgresAuditLogWriter();
  }

  async createIdempotent(record: LearningFeedbackSubmission, context: LearningFeedbackCreateContext): Promise<LearningFeedbackSubmission> {
    const requestId = sanitizeCorrelationId(context.requestId);
    const inserted = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(learningFeedbackSubmissions).values(this.values(record)).onConflictDoNothing({
        target: [learningFeedbackSubmissions.tenantId, learningFeedbackSubmissions.reviewerDecisionId, learningFeedbackSubmissions.digest, learningFeedbackSubmissions.consentNoticeVersion],
      }).returning({ payload: learningFeedbackSubmissions.payload });
      if (created === undefined) return undefined;
      await tx.insert(learningFeedbackEvents).values(this.eventValues({
        id: `learning_feedback_event_${randomUUID()}`,
        tenantId: record.tenantId,
        learningFeedbackId: record.id,
        eventType: 'SUBMITTED',
        toStatus: record.status,
        actorPseudonym: context.actorPseudonym,
        pseudonymKeyVersion: context.pseudonymKeyVersion,
        ...(requestId === undefined ? {} : { requestId }),
        occurredAt: record.createdAt,
      }));
      return created.payload;
    });
    if (inserted !== undefined) return inserted;
    const existing = await this.findIdempotent({ tenantId: record.tenantId, reviewerDecisionId: record.reviewerDecisionId, digest: record.digest, consentNoticeVersion: record.consentNoticeVersion });
    if (existing === undefined) throw new Error('LEARNING_FEEDBACK_IDEMPOTENCY_CONFLICT');
    return existing;
  }

  async findById(id: string, tenantId: string): Promise<LearningFeedbackSubmission | undefined> {
    const [row] = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(and(eq(learningFeedbackSubmissions.id, id), eq(learningFeedbackSubmissions.tenantId, tenantId))).limit(1);
    return row?.payload;
  }

  async findReviewerDecisionOwner(input: { tenantId: string; auditRunId: string; humanReviewTicketId: string; reviewerDecisionId: string }): Promise<string | undefined> {
    const [row] = await this.db.select({ reviewerId: humanReviewFeedback.reviewerId }).from(humanReviewFeedback).where(and(
      eq(humanReviewFeedback.id, input.reviewerDecisionId), eq(humanReviewFeedback.tenantId, input.tenantId),
      eq(humanReviewFeedback.auditRunId, input.auditRunId), eq(humanReviewFeedback.reviewTicketId, input.humanReviewTicketId),
    )).limit(1);
    return row?.reviewerId;
  }

  async list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }): Promise<LearningFeedbackSubmission[]> {
    const where = options.status === undefined || options.status === 'all'
      ? eq(learningFeedbackSubmissions.tenantId, options.tenantId)
      : and(eq(learningFeedbackSubmissions.tenantId, options.tenantId), eq(learningFeedbackSubmissions.status, options.status));
    const rows = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(where).orderBy(desc(learningFeedbackSubmissions.createdAt)).limit(options.limit ?? 50);
    return rows.map((row) => row.payload);
  }

  async listEvents(learningFeedbackId: string, tenantId: string): Promise<LearningFeedbackEvent[]> {
    const rows = await this.db.select().from(learningFeedbackEvents).where(and(eq(learningFeedbackEvents.learningFeedbackId, learningFeedbackId), eq(learningFeedbackEvents.tenantId, tenantId))).orderBy(learningFeedbackEvents.occurredAt);
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      learningFeedbackId: row.learningFeedbackId,
      eventType: row.eventType,
      ...(row.fromStatus == null ? {} : { fromStatus: row.fromStatus }),
      toStatus: row.toStatus,
      actorPseudonym: row.actorPseudonym,
      pseudonymKeyVersion: row.pseudonymKeyVersion,
      ...(row.reasonCode == null ? {} : { reasonCode: row.reasonCode }),
      ...(row.reasonNoteRedacted == null ? {} : { reasonNoteRedacted: row.reasonNoteRedacted }),
      ...(row.requestId == null ? {} : { requestId: row.requestId }),
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async transitionQuarantined(command: LearningFeedbackTransitionCommand): Promise<LearningFeedbackSubmission | undefined> {
    return this.transitionWithEvent(command);
  }

  async getCurrentDatabaseName(): Promise<string> {
    const result = await this.pool.query<{ database_name: string }>('SELECT current_database() AS database_name');
    return result.rows[0]?.database_name ?? '';
  }

  async previewRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const effectiveInput = await this.withDatabaseStart(client, input);
      const summary = await this.retentionSummary(client, effectiveInput, 'DRY_RUN', false);
      await this.insertRetentionRunAndAudit(client, effectiveInput, summary);
      await client.query('COMMIT');
      return summary;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async executeRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const effectiveInput = await this.withDatabaseStart(client, input);
      const summary = await this.retentionSummary(client, effectiveInput, 'EXECUTE', true);
      if (summary.status === 'ANOMALY') {
        await client.query('ROLLBACK');
        await client.query('BEGIN');
        await this.insertRetentionRunAndAudit(client, effectiveInput, summary);
        await client.query('COMMIT');
        return summary;
      }
      await this.insertRetentionRunAndAudit(client, effectiveInput, summary);
      await client.query('COMMIT');
      return summary;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }

  private async transitionWithEvent(command: LearningFeedbackTransitionCommand): Promise<LearningFeedbackSubmission | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<{ status: LearningFeedbackStatus; payload: LearningFeedbackSubmission }>(
        'SELECT status, payload FROM learning_feedback_submissions WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
        [command.learningFeedbackId, command.tenantId],
      );
      const current = selected.rows[0];
      if (current === undefined || !['RECEIVED', 'NEEDS_REVIEW'].includes(current.status)) {
        await client.query('ROLLBACK');
        return undefined;
      }
      this.validateTransition(command);
      const timestamp = await client.query<{ occurred_at: Date }>('SELECT clock_timestamp() AS occurred_at');
      const occurredAt = timestamp.rows[0]?.occurred_at ?? new Date();
      const updated: LearningFeedbackSubmission = {
        ...current.payload,
        status: command.targetStatus,
        updatedAt: occurredAt.toISOString(),
        ...(command.targetStatus === 'WITHDRAWN' ? { withdrawnAt: occurredAt.toISOString() } : {}),
      };
      await client.query(
        'UPDATE learning_feedback_submissions SET status=$3,payload=$4,updated_at=$5,withdrawn_at=$6,governance_version=governance_version+1 WHERE id=$1 AND tenant_id=$2',
        [command.learningFeedbackId, command.tenantId, command.targetStatus, updated, occurredAt, command.targetStatus === 'WITHDRAWN' ? occurredAt : null],
      );
      const eventType = command.targetStatus === 'WITHDRAWN' ? 'WITHDRAWN' : command.targetStatus === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED';
      const requestId = sanitizeCorrelationId(command.requestId);
      const reasonNoteRedacted = command.reasonNoteRedacted === undefined ? undefined : sanitizeSensitiveText(command.reasonNoteRedacted).value;
      await client.query(`
        INSERT INTO learning_feedback_events
          (id,tenant_id,learning_feedback_id,event_type,from_status,to_status,actor_pseudonym,pseudonym_key_version,reason_code,reason_note_redacted,request_id,metadata,occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}'::jsonb,$12)
      `, [`learning_feedback_event_${randomUUID()}`, command.tenantId, command.learningFeedbackId, eventType, current.status, command.targetStatus, command.actorPseudonym, command.pseudonymKeyVersion, command.reasonCode ?? null, reasonNoteRedacted ?? null, requestId ?? null, occurredAt]);
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateTransition(command: LearningFeedbackTransitionCommand): void {
    if (command.targetStatus === 'WITHDRAWN') {
      if (command.reasonCode !== undefined || command.reasonNoteRedacted !== undefined) throw new Error('LEARNING_FEEDBACK_TRANSITION_INVALID');
      return;
    }
    if (command.reasonCode === undefined || !isLearningFeedbackReviewReasonAllowed(command.targetStatus, command.reasonCode)) throw new Error('LEARNING_FEEDBACK_TRANSITION_INVALID');
  }

  private async withDatabaseStart(client: PoolClient, input: RetentionOperationInput): Promise<RetentionExecutionInput> {
    const result = await client.query<{ operation_started_at: Date }>('SELECT clock_timestamp() AS operation_started_at');
    return { ...input, operationStartedAt: result.rows[0]?.operation_started_at ?? new Date() };
  }

  private async retentionSummary(client: PoolClient, input: RetentionExecutionInput, mode: LearningFeedbackRetentionSummary['mode'], execute: boolean): Promise<LearningFeedbackRetentionSummary> {
    const anomaly = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM learning_feedback_submissions WHERE tenant_id = $1 AND status = 'PROMOTED_TO_GOLD_SET'", [input.tenantId]);
    const anomalyCount = Number(anomaly.rows[0]?.count ?? '0');
    if (execute && anomalyCount > 0) return {
      runId: input.runId, tenantId: input.tenantId, mode, status: 'ANOMALY', failureCode: 'GOLD_SET_ANOMALY',
      cutoff: input.cutoff.toISOString(), operationStartedAt: input.operationStartedAt.toISOString(), batchLimit: input.batchLimit,
      candidateCount: 0, deletedCount: 0, countsByStatus: {}, candidateIds: [], anomalyCount,
      occurredAt: input.occurredAt.toISOString(),
    };
    const params = [input.tenantId, [...learningFeedbackRetentionExpiryStatuses], input.cutoff, input.batchLimit, input.operationStartedAt];
    const rows = execute
      ? await client.query<{ id: string; status: LearningFeedbackStatus }>(`
          WITH candidates AS MATERIALIZED (
            SELECT target.id, target.governance_version
            FROM learning_feedback_submissions target
            WHERE target.tenant_id = $1 AND (
              (target.status = ANY($2::text[]) AND target.retention_expires_at <= $3)
              OR (target.status = 'WITHDRAWN' AND target.withdrawn_at IS NOT NULL AND target.withdrawn_at <= $3)
            ) AND target.updated_at < $5
            ORDER BY COALESCE(target.withdrawn_at, target.retention_expires_at), target.id
            LIMIT $4
            FOR UPDATE OF target SKIP LOCKED
          )
          DELETE FROM learning_feedback_submissions target
          USING candidates
          WHERE target.id = candidates.id
            AND target.governance_version = candidates.governance_version
            AND target.tenant_id = $1 AND target.updated_at < $5 AND (
            (target.status = ANY($2::text[]) AND target.retention_expires_at <= $3)
            OR (target.status = 'WITHDRAWN' AND target.withdrawn_at IS NOT NULL AND target.withdrawn_at <= $3)
            )
          RETURNING target.id, target.status
        `, params)
      : await client.query<{ id: string; status: LearningFeedbackStatus }>(`
          SELECT id, status FROM learning_feedback_submissions
          WHERE tenant_id = $1 AND (
            (status = ANY($2::text[]) AND retention_expires_at <= $3)
            OR (status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_at <= $3)
          ) AND updated_at < $5
          ORDER BY COALESCE(withdrawn_at, retention_expires_at), id LIMIT $4
        `, params);
    const countsByStatus: Partial<Record<LearningFeedbackStatus, number>> = {};
    for (const row of rows.rows) countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
    return {
      runId: input.runId,
      tenantId: input.tenantId,
      mode,
      status: 'SUCCEEDED',
      cutoff: input.cutoff.toISOString(),
      operationStartedAt: input.operationStartedAt.toISOString(),
      batchLimit: input.batchLimit,
      candidateCount: rows.rowCount ?? rows.rows.length,
      deletedCount: execute ? (rows.rowCount ?? rows.rows.length) : 0,
      countsByStatus,
      candidateIds: rows.rows.map((row) => row.id),
      anomalyCount,
      occurredAt: input.occurredAt.toISOString(),
    };
  }

  private async insertRetentionRunAndAudit(client: PoolClient, input: RetentionExecutionInput, summary: LearningFeedbackRetentionSummary): Promise<void> {
    await client.query(`
      INSERT INTO learning_feedback_retention_runs
        (id, tenant_id, mode, run_status, failure_code, cutoff, operation_started_at, batch_limit, candidate_count, deleted_count, counts_by_status, anomaly_count, actor_pseudonym, pseudonym_key_version, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [summary.runId, input.tenantId, summary.mode, summary.status, summary.failureCode ?? null, input.cutoff, input.operationStartedAt, input.batchLimit, summary.candidateCount, summary.deletedCount, summary.countsByStatus, summary.anomalyCount, input.actorPseudonym, input.pseudonymKeyVersion, input.occurredAt]);
    await this.auditLogWriter.recordRetentionWithClient(client, {
      actorUserId: input.auditActorId,
      tenantId: input.tenantId,
      summary: {
        runId: summary.runId,
        mode: summary.mode,
        status: summary.status,
        ...(summary.failureCode === undefined ? {} : { failureCode: summary.failureCode }),
        cutoff: summary.cutoff,
        operationStartedAt: summary.operationStartedAt,
        batchLimit: summary.batchLimit,
        candidateCount: summary.candidateCount,
        deletedCount: summary.deletedCount,
        countsByStatus: summary.countsByStatus,
        anomalyCount: summary.anomalyCount,
      },
      occurredAt: input.occurredAt,
    });
  }

  private values(record: LearningFeedbackSubmission) {
    return {
      id: record.id, tenantId: record.tenantId, auditRunId: record.auditRunId, humanReviewTicketId: record.humanReviewTicketId,
      reviewerDecisionId: record.reviewerDecisionId, source: record.source, status: record.status, consentScope: record.consentScope,
      consentNoticeVersion: record.consentNoticeVersion, consentedAt: new Date(record.consentedAt), purpose: record.purpose,
      retentionDays: record.retentionDays, retentionExpiresAt: new Date(record.retentionExpiresAt), reviewerPseudonym: record.reviewerPseudonym,
      pseudonymKeyVersion: record.pseudonymKeyVersion, digest: record.digest, sanitizedComment: record.sanitizedComment,
      sanitizedEvidenceFragments: record.sanitizedEvidenceFragments, redactionSummary: record.redactionSummary, agentDecision: record.agentDecision,
      humanDecision: record.humanDecision, ruleVersion: record.ruleVersion ?? null, lawKbVersion: record.lawKbVersion ?? null,
      payload: record, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt), withdrawnAt: record.withdrawnAt === undefined ? null : new Date(record.withdrawnAt), supersededBy: record.supersededBy ?? null,
    };
  }

  private eventValues(event: LearningFeedbackEvent) {
    return {
      id: event.id,
      tenantId: event.tenantId,
      learningFeedbackId: event.learningFeedbackId,
      eventType: event.eventType,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus,
      actorPseudonym: event.actorPseudonym,
      pseudonymKeyVersion: event.pseudonymKeyVersion,
      reasonCode: event.reasonCode ?? null,
      reasonNoteRedacted: event.reasonNoteRedacted ?? null,
      requestId: event.requestId ?? null,
      metadata: {},
      occurredAt: new Date(event.occurredAt),
    };
  }

  private async findIdempotent(input: { tenantId: string; reviewerDecisionId: string; digest: string; consentNoticeVersion: string }): Promise<LearningFeedbackSubmission | undefined> {
    const [row] = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(and(
      eq(learningFeedbackSubmissions.tenantId, input.tenantId), eq(learningFeedbackSubmissions.reviewerDecisionId, input.reviewerDecisionId),
      eq(learningFeedbackSubmissions.digest, input.digest), eq(learningFeedbackSubmissions.consentNoticeVersion, input.consentNoticeVersion),
    )).limit(1);
    return row?.payload;
  }
}
