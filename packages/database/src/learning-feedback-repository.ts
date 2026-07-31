import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Pool as PgPool } from 'pg';
import type { LearningFeedbackStatus, LearningFeedbackSubmission } from '@job-compliance/shared';
import { learningFeedbackSubmissions } from './schema.js';
import * as schema from './schema.js';

const { Pool } = pg;

export interface LearningFeedbackRepository {
  findIdempotent(input: { tenantId: string; reviewerDecisionId: string; digest: string; consentNoticeVersion: string }): Promise<LearningFeedbackSubmission | undefined>;
  create(record: LearningFeedbackSubmission): Promise<LearningFeedbackSubmission>;
  findById(id: string, tenantId?: string): Promise<LearningFeedbackSubmission | undefined>;
  list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }): Promise<LearningFeedbackSubmission[]>;
  update(record: LearningFeedbackSubmission): Promise<LearningFeedbackSubmission>;
  listExpired(now: Date): Promise<LearningFeedbackSubmission[]>;
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

  async findIdempotent(input: { tenantId: string; reviewerDecisionId: string; digest: string; consentNoticeVersion: string }): Promise<LearningFeedbackSubmission | undefined> {
    const [row] = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(and(
      eq(learningFeedbackSubmissions.tenantId, input.tenantId), eq(learningFeedbackSubmissions.reviewerDecisionId, input.reviewerDecisionId),
      eq(learningFeedbackSubmissions.digest, input.digest), eq(learningFeedbackSubmissions.consentNoticeVersion, input.consentNoticeVersion),
    )).limit(1);
    return row?.payload;
  }

  async create(record: LearningFeedbackSubmission): Promise<LearningFeedbackSubmission> {
    await this.db.insert(learningFeedbackSubmissions).values(this.values(record));
    return structuredClone(record);
  }

  async findById(id: string, tenantId?: string): Promise<LearningFeedbackSubmission | undefined> {
    const where = tenantId === undefined ? eq(learningFeedbackSubmissions.id, id) : and(eq(learningFeedbackSubmissions.id, id), eq(learningFeedbackSubmissions.tenantId, tenantId));
    const [row] = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(where).limit(1);
    return row?.payload;
  }

  async list(options: { tenantId: string; status?: LearningFeedbackStatus | 'all'; limit?: number }): Promise<LearningFeedbackSubmission[]> {
    const where = options.status === undefined || options.status === 'all'
      ? eq(learningFeedbackSubmissions.tenantId, options.tenantId)
      : and(eq(learningFeedbackSubmissions.tenantId, options.tenantId), eq(learningFeedbackSubmissions.status, options.status));
    const rows = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(where).orderBy(desc(learningFeedbackSubmissions.createdAt)).limit(options.limit ?? 50);
    return rows.map((row) => row.payload);
  }

  async update(record: LearningFeedbackSubmission): Promise<LearningFeedbackSubmission> {
    await this.db.update(learningFeedbackSubmissions).set({ status: record.status, payload: record, updatedAt: new Date(record.updatedAt), withdrawnAt: record.withdrawnAt === undefined ? null : new Date(record.withdrawnAt), supersededBy: record.supersededBy ?? null }).where(eq(learningFeedbackSubmissions.id, record.id));
    return structuredClone(record);
  }

  async listExpired(now: Date): Promise<LearningFeedbackSubmission[]> {
    const rows = await this.db.select({ payload: learningFeedbackSubmissions.payload }).from(learningFeedbackSubmissions).where(and(lte(learningFeedbackSubmissions.retentionExpiresAt, now), inArray(learningFeedbackSubmissions.status, ['RECEIVED', 'NEEDS_REVIEW', 'REJECTED'])));
    return rows.map((row) => row.payload);
  }

  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }

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
}
