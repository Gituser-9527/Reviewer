import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';
import {
  learningFeedbackRetentionExpiryStatuses,
  type LearningFeedbackEvent,
  type LearningFeedbackRetentionSummary,
  type LearningFeedbackStatus,
  type LearningFeedbackSubmission,
} from '@job-compliance/shared';
import {
  humanReviewFeedback,
  learningFeedbackEvents,
  learningFeedbackSubmissions,
} from './schema.js';
import * as schema from './schema.js';

const { Pool } = pg;

export interface RetentionOperationInput {
  tenantId: string;
  cutoff: Date;
  batchLimit: number;
  actorPseudonym: string;
  pseudonymKeyVersion: string;
  auditActorId: string;
  occurredAt: Date;
}

export interface LearningFeedbackRepository {
  createIdempotent(record: LearningFeedbackSubmission, event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission>;
  findById(id: string, tenantId: string): Promise<LearningFeedbackSubmission | undefined>;
  findReviewerDecisionOwner(input: { tenantId: string; auditRunId: string; humanReviewTicketId: string; reviewerDecisionId: string }): Promise<string | undefined>;
  list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }): Promise<LearningFeedbackSubmission[]>;
  listEvents(learningFeedbackId: string, tenantId: string): Promise<LearningFeedbackEvent[]>;
  withdrawIfQuarantined(record: LearningFeedbackSubmission, tenantId: string, event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission | undefined>;
  reviewIfQuarantined(record: LearningFeedbackSubmission, tenantId: string, event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission | undefined>;
  previewRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary>;
  executeRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary>;
  close(): Promise<void>;
}

export class PostgresLearningFeedbackRepository implements LearningFeedbackRepository {
  private readonly pool: PgPool;
  private readonly db: NodePgDatabase<typeof schema>;
  private readonly ownsPool: boolean;

  constructor(options: { connectionString?: string; pool?: PgPool }) {
    if (options.pool === undefined && options.connectionString === undefined) throw new Error('PostgresLearningFeedbackRepository requires a pool or connectionString.');
    this.pool = options.pool ?? new Pool({ connectionString: options.connectionString });
    this.db = drizzle(this.pool, { schema });
    this.ownsPool = options.pool === undefined;
  }

  async createIdempotent(record: LearningFeedbackSubmission, event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission> {
    const inserted = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(learningFeedbackSubmissions).values(this.values(record)).onConflictDoNothing({
        target: [learningFeedbackSubmissions.tenantId, learningFeedbackSubmissions.reviewerDecisionId, learningFeedbackSubmissions.digest, learningFeedbackSubmissions.consentNoticeVersion],
      }).returning({ payload: learningFeedbackSubmissions.payload });
      if (created === undefined) return undefined;
      await tx.insert(learningFeedbackEvents).values(this.eventValues(event));
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

  async withdrawIfQuarantined(record: LearningFeedbackSubmission, tenantId: string, event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission | undefined> {
    return this.transitionWithEvent(record, tenantId, ['RECEIVED', 'NEEDS_REVIEW'], event);
  }

  async reviewIfQuarantined(record: LearningFeedbackSubmission, tenantId: string, event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission | undefined> {
    return this.transitionWithEvent(record, tenantId, ['RECEIVED', 'NEEDS_REVIEW'], event);
  }

  async previewRetention(input: RetentionOperationInput): Promise<LearningFeedbackRetentionSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const summary = await this.retentionSummary(client, input, 'DRY_RUN', false);
      await this.insertRetentionRunAndAudit(client, input, summary);
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
      const summary = await this.retentionSummary(client, input, 'EXECUTE', true);
      await this.insertRetentionRunAndAudit(client, input, summary);
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

  private async transitionWithEvent(record: LearningFeedbackSubmission, tenantId: string, expectedStatuses: LearningFeedbackStatus[], event: LearningFeedbackEvent): Promise<LearningFeedbackSubmission | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(learningFeedbackSubmissions).set({
        status: record.status,
        payload: record,
        updatedAt: new Date(record.updatedAt),
        withdrawnAt: record.withdrawnAt === undefined ? null : new Date(record.withdrawnAt),
        supersededBy: record.supersededBy ?? null,
      }).where(and(
        eq(learningFeedbackSubmissions.id, record.id),
        eq(learningFeedbackSubmissions.tenantId, tenantId),
        inArray(learningFeedbackSubmissions.status, expectedStatuses),
      )).returning({ payload: learningFeedbackSubmissions.payload });
      if (row === undefined) return undefined;
      await tx.insert(learningFeedbackEvents).values(this.eventValues(event));
      return row.payload;
    });
  }

  private async retentionSummary(client: PoolClient, input: RetentionOperationInput, mode: LearningFeedbackRetentionSummary['mode'], execute: boolean): Promise<LearningFeedbackRetentionSummary> {
    const anomaly = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM learning_feedback_submissions WHERE tenant_id = $1 AND status = 'PROMOTED_TO_GOLD_SET'", [input.tenantId]);
    const anomalyCount = Number(anomaly.rows[0]?.count ?? '0');
    if (execute && anomalyCount > 0) throw new Error('LEARNING_FEEDBACK_RETENTION_GOLD_SET_ANOMALY');
    const params = [input.tenantId, [...learningFeedbackRetentionExpiryStatuses], input.cutoff, input.batchLimit];
    const rows = execute
      ? await client.query<{ id: string; status: LearningFeedbackStatus }>(`
          WITH candidates AS (
            SELECT id FROM learning_feedback_submissions
            WHERE tenant_id = $1 AND (
              (status = ANY($2::text[]) AND retention_expires_at <= $3)
              OR (status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_at <= $3)
            )
            ORDER BY COALESCE(withdrawn_at, retention_expires_at), id
            FOR UPDATE SKIP LOCKED LIMIT $4
          )
          DELETE FROM learning_feedback_submissions target
          USING candidates
          WHERE target.id = candidates.id AND target.tenant_id = $1 AND (
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
          )
          ORDER BY COALESCE(withdrawn_at, retention_expires_at), id LIMIT $4
        `, params);
    const countsByStatus: Partial<Record<LearningFeedbackStatus, number>> = {};
    for (const row of rows.rows) countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
    return {
      tenantId: input.tenantId,
      mode,
      cutoff: input.cutoff.toISOString(),
      batchLimit: input.batchLimit,
      candidateCount: rows.rowCount ?? rows.rows.length,
      deletedCount: execute ? (rows.rowCount ?? rows.rows.length) : 0,
      countsByStatus,
      candidateIds: rows.rows.map((row) => row.id),
      anomalyCount,
      occurredAt: input.occurredAt.toISOString(),
    };
  }

  private async insertRetentionRunAndAudit(client: PoolClient, input: RetentionOperationInput, summary: LearningFeedbackRetentionSummary): Promise<void> {
    const safeSummary = {
      mode: summary.mode,
      cutoff: summary.cutoff,
      batchLimit: summary.batchLimit,
      candidateCount: summary.candidateCount,
      deletedCount: summary.deletedCount,
      countsByStatus: summary.countsByStatus,
      anomalyCount: summary.anomalyCount,
    };
    await client.query(`
      INSERT INTO learning_feedback_retention_runs
        (id, tenant_id, mode, cutoff, batch_limit, candidate_count, deleted_count, counts_by_status, anomaly_count, actor_pseudonym, pseudonym_key_version, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [randomUUID(), input.tenantId, summary.mode, input.cutoff, input.batchLimit, summary.candidateCount, summary.deletedCount, summary.countsByStatus, summary.anomalyCount, input.actorPseudonym, input.pseudonymKeyVersion, input.occurredAt]);
    await client.query(`
      INSERT INTO audit_operation_logs
        (id, actor_user_id, actor_role, tenant_id, operation, resource_type, before_payload, after_payload, payload, created_at)
      VALUES ($1,$2,'INTERNAL_MAINTENANCE',$3,$4,'learning_feedback_retention',NULL,$5,$6,$7)
    `, [`audit_op_${randomUUID()}`, input.auditActorId, input.tenantId, summary.mode === 'DRY_RUN' ? 'learning_feedback_retention_dry_run' : 'learning_feedback_retention_execute', safeSummary, safeSummary, input.occurredAt]);
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
