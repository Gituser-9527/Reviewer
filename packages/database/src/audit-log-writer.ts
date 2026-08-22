import { randomUUID } from 'node:crypto';
import { sanitizeAuditLog } from '@job-compliance/core';
import type { LearningFeedbackRetentionSummary } from '@job-compliance/shared';
import type { PoolClient } from 'pg';

export type RetentionAuditSummary = Pick<
  LearningFeedbackRetentionSummary,
  'runId' | 'mode' | 'status' | 'cutoff' | 'operationStartedAt' | 'batchLimit' | 'candidateCount' | 'deletedCount' | 'countsByStatus' | 'anomalyCount'
>;

const allowedSummaryKeys = new Set([
  'runId', 'mode', 'status', 'cutoff', 'operationStartedAt', 'batchLimit',
  'candidateCount', 'deletedCount', 'countsByStatus', 'anomalyCount',
]);

export interface TransactionalAuditLogWriter {
  recordRetentionWithClient(client: PoolClient, input: {
    actorUserId: string;
    tenantId: string;
    summary: RetentionAuditSummary;
    occurredAt: Date;
  }): Promise<void>;
}

/** The single PostgreSQL writer for minimal, sanitized Retention operation audit records. */
export class PostgresAuditLogWriter implements TransactionalAuditLogWriter {
  async recordRetentionWithClient(client: PoolClient, input: {
    actorUserId: string;
    tenantId: string;
    summary: RetentionAuditSummary;
    occurredAt: Date;
  }): Promise<void> {
    const keys = Object.keys(input.summary);
    if (keys.some((key) => !allowedSummaryKeys.has(key))) throw new Error('AUDIT_LOG_FIELD_NOT_ALLOWED');
    const safeSummary = sanitizeAuditLog(input.summary);
    await client.query(`
      INSERT INTO audit_operation_logs
        (id, actor_user_id, actor_role, tenant_id, operation, resource_type, resource_id, before_payload, after_payload, payload, created_at)
      VALUES ($1,$2,'INTERNAL_MAINTENANCE',$3,$4,'learning_feedback_retention',$5,NULL,$6,$6,$7)
    `, [
      `audit_op_${randomUUID()}`,
      input.actorUserId,
      input.tenantId,
      'learning_feedback_retention_dry_run',
      input.summary.runId,
      safeSummary,
      input.occurredAt,
    ]);
  }
}
