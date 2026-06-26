import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Pool as PgPool } from 'pg';
import type {
  AuditResult,
  HumanReviewFeedbackType,
  HumanReviewFeedback,
  HumanReviewStatus,
  HumanReviewTicket,
  JobPostingInput,
  RuleImprovementSuggestion,
  SubmitHumanReviewDecisionInput,
} from '@job-compliance/shared';
import { createAuditRunPersistenceModel, type PersistAuditRunInput } from './persistence-model.js';
import { redactJson, redactSensitiveText } from './privacy.js';
import {
  auditEvidenceLinks,
  auditFindings,
  auditRuns,
  humanReviewFeedback,
  jobPostings,
  reviewTickets,
  ruleImprovementSuggestions,
} from './schema.js';
import * as schema from './schema.js';

const { Pool } = pg;
const manualReviewDecision = 'MANUAL_REVIEW';

/** Query options used when listing completed audit runs. */
export interface ListAuditRunsOptions {
  /** Tenant whose runs should be returned. */
  tenantId: string;
  /** Maximum rows to return. Defaults to 50. */
  limit?: number;
}

/** Query options used when listing human review tickets. */
export interface ListHumanReviewTicketsOptions {
  /** Optional tenant scope. */
  tenantId?: string;
  /** Ticket status filter. Defaults to pending. */
  status?: HumanReviewStatus | 'all';
  /** Maximum rows to return. Defaults to 50. */
  limit?: number;
}

export interface ListRuleImprovementSuggestionsOptions {
  tenantId?: string;
  status?: RuleImprovementSuggestion['status'] | 'all';
  limit?: number;
}

export interface CreateRuleImprovementSuggestionInput {
  reviewTicketId: string;
  createdBy: string;
  feedbackType?: HumanReviewFeedbackType;
  category?: RuleImprovementSuggestion['category'];
  ruleId?: string;
  title?: string;
  description?: string;
}

export interface ResolveRuleImprovementSuggestionInput {
  resolvedBy: string;
  resolutionComment?: string;
}

/** Persistence contract used by the API adapter. */
export interface AuditRunRepository {
  /** Persists a completed audit run, its posting snapshot, findings and evidence links. */
  saveAuditRun(input: PersistAuditRunInput): Promise<void>;
  /** Finds one audit run by ID, optionally scoped to a tenant. */
  findAuditRunById(auditRunId: string, tenantId?: string): Promise<AuditResult | undefined>;
  /** Lists recent audit runs for a tenant. */
  listAuditRuns(options: ListAuditRunsOptions): Promise<AuditResult[]>;
  /** Creates or returns the review ticket derived from a MANUAL_REVIEW audit run. */
  createHumanReviewTicket(
    result: AuditResult,
    jobPosting?: JobPostingInput,
  ): Promise<HumanReviewTicket | undefined>;
  /** Finds one human review ticket by id. */
  findHumanReviewTicketById(id: string): Promise<HumanReviewTicket | undefined>;
  /** Lists human review tickets. */
  listHumanReviewTickets(options?: ListHumanReviewTicketsOptions): Promise<HumanReviewTicket[]>;
  /** Persists human review feedback and returns the updated ticket. */
  submitHumanReviewDecision(
    id: string,
    input: SubmitHumanReviewDecisionInput,
  ): Promise<HumanReviewTicket | undefined>;
  createRuleImprovementSuggestion(
    input: CreateRuleImprovementSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined>;
  listRuleImprovementSuggestions(
    options?: ListRuleImprovementSuggestionsOptions,
  ): Promise<RuleImprovementSuggestion[]>;
  resolveRuleImprovementSuggestion(
    id: string,
    input: ResolveRuleImprovementSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined>;
  /** Releases database resources owned by the repository. */
  close(): Promise<void>;
  /** Verifies the repository can reach PostgreSQL. */
  healthCheck?(): Promise<{ status: 'up' | 'down' }>;
}

export interface PostgresAuditRunRepositoryOptions {
  /** PostgreSQL connection string. */
  connectionString?: string;
  /** Existing pool supplied by tests or application bootstrap. */
  pool?: PgPool;
}

/** Drizzle/PostgreSQL repository for audit persistence. */
export class PostgresAuditRunRepository implements AuditRunRepository {
  private readonly pool: PgPool;
  private readonly db: NodePgDatabase<typeof schema>;
  private readonly ownsPool: boolean;

  constructor(options: PostgresAuditRunRepositoryOptions = {}) {
    if (options.pool === undefined && options.connectionString === undefined) {
      throw new Error('PostgresAuditRunRepository requires a pool or connectionString.');
    }
    this.pool = options.pool ?? new Pool({ connectionString: options.connectionString });
    this.db = drizzle(this.pool, { schema });
    this.ownsPool = options.pool === undefined;
  }

  async saveAuditRun(input: PersistAuditRunInput): Promise<void> {
    const model = createAuditRunPersistenceModel(input);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      const [posting] = await tx
        .insert(jobPostings)
        .values({
          tenantId: model.jobPosting.tenantId,
          externalId: model.jobPosting.externalId ?? null,
          title: model.jobPosting.title,
          companyName: model.jobPosting.companyName ?? null,
          location: model.jobPosting.location ?? null,
          employmentType: model.jobPosting.employmentType ?? null,
          salaryText: model.jobPosting.salaryText ?? null,
          rawTextRedacted: model.jobPosting.rawTextRedacted,
          inputHash: model.jobPosting.inputHash,
          inputPayload: model.jobPosting.inputPayload,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [jobPostings.tenantId, jobPostings.inputHash],
          set: {
            externalId: model.jobPosting.externalId ?? null,
            title: model.jobPosting.title,
            companyName: model.jobPosting.companyName ?? null,
            location: model.jobPosting.location ?? null,
            employmentType: model.jobPosting.employmentType ?? null,
            salaryText: model.jobPosting.salaryText ?? null,
            rawTextRedacted: model.jobPosting.rawTextRedacted,
            inputPayload: model.jobPosting.inputPayload,
            updatedAt: now,
          },
        })
        .returning({ id: jobPostings.id });

      if (posting === undefined) {
        throw new Error('Failed to persist job posting snapshot.');
      }

      await tx
        .insert(auditRuns)
        .values({
          id: model.auditRun.id,
          tenantId: model.auditRun.tenantId,
          jobPostingId: posting.id,
          decision: model.auditRun.decision,
          riskLevel: model.auditRun.riskLevel,
          summary: model.auditRun.summary,
          ruleVersion: model.auditRun.ruleVersion,
          lawKbVersion: model.auditRun.lawKbVersion,
          modelVersion: model.auditRun.modelVersion ?? null,
          inputHash: model.auditRun.inputHash,
          resultPayload: model.auditRun.resultPayload,
          evaluatedAt: model.auditRun.evaluatedAt,
          createdAt: model.auditRun.createdAt,
          persistedAt: now,
        })
        .onConflictDoUpdate({
          target: auditRuns.id,
          set: {
            tenantId: model.auditRun.tenantId,
            jobPostingId: posting.id,
            decision: model.auditRun.decision,
            riskLevel: model.auditRun.riskLevel,
            summary: model.auditRun.summary,
            ruleVersion: model.auditRun.ruleVersion,
            lawKbVersion: model.auditRun.lawKbVersion,
            modelVersion: model.auditRun.modelVersion ?? null,
            inputHash: model.auditRun.inputHash,
            resultPayload: model.auditRun.resultPayload,
            evaluatedAt: model.auditRun.evaluatedAt,
            createdAt: model.auditRun.createdAt,
            persistedAt: now,
          },
        });

      await tx
        .delete(auditEvidenceLinks)
        .where(eq(auditEvidenceLinks.auditRunId, model.auditRun.id));
      await tx.delete(auditFindings).where(eq(auditFindings.auditRunId, model.auditRun.id));

      if (model.findings.length > 0) {
        await tx.insert(auditFindings).values(
          model.findings.map((finding) => ({
            auditRunId: finding.auditRunId,
            findingId: finding.findingId,
            tenantId: finding.tenantId,
            category: finding.category,
            severity: finding.severity,
            decision: finding.decision,
            ruleId: finding.ruleId ?? null,
            evidenceId: finding.evidenceId ?? null,
            title: finding.title,
            message: finding.message,
            suggestion: finding.suggestion ?? null,
            payload: finding.payload,
          })),
        );
      }

      if (model.evidenceLinks.length > 0) {
        await tx.insert(auditEvidenceLinks).values(
          model.evidenceLinks.map((link) => ({
            auditRunId: link.auditRunId,
            findingId: link.findingId ?? null,
            tenantId: link.tenantId,
            evidenceId: link.evidenceId,
            sourceType: link.sourceType,
            title: link.title,
            url: link.url,
            version: link.version,
            quoteRedacted: link.quoteRedacted ?? null,
            payload: link.payload,
          })),
        );
      }
    });
  }

  async findAuditRunById(auditRunId: string, tenantId?: string): Promise<AuditResult | undefined> {
    const where =
      tenantId === undefined
        ? eq(auditRuns.id, auditRunId)
        : and(eq(auditRuns.id, auditRunId), eq(auditRuns.tenantId, tenantId));
    const [row] = await this.db
      .select({ resultPayload: auditRuns.resultPayload })
      .from(auditRuns)
      .where(where)
      .limit(1);
    return row?.resultPayload;
  }

  async listAuditRuns(options: ListAuditRunsOptions): Promise<AuditResult[]> {
    const rows = await this.db
      .select({ resultPayload: auditRuns.resultPayload })
      .from(auditRuns)
      .where(eq(auditRuns.tenantId, options.tenantId))
      .orderBy(desc(auditRuns.createdAt))
      .limit(options.limit ?? 50);
    return rows.map((row) => row.resultPayload);
  }

  async createHumanReviewTicket(
    result: AuditResult,
    jobPosting?: JobPostingInput,
  ): Promise<HumanReviewTicket | undefined> {
    if (result.decision !== manualReviewDecision) return undefined;
    const existing = await this.findHumanReviewTicketById(result.auditId);
    if (existing !== undefined) return existing;
    const resolvedJobPosting = jobPosting ?? (await this.findJobPostingForAuditRun(result.auditId));
    const ticket = redactJson(this.buildHumanReviewTicket(result, resolvedJobPosting));
    const now = new Date();
    await this.db.insert(reviewTickets).values({
      id: ticket.id,
      auditRunId: ticket.auditRunId,
      tenantId: ticket.tenantId,
      status: ticket.status,
      agentDecision: ticket.agentDecision,
      riskLevel: ticket.riskLevel,
      suggestedAction: ticket.suggestedAction,
      summaryRedacted: redactSensitiveText(ticket.summary),
      payload: ticket,
      createdAt: new Date(ticket.createdAt),
      updatedAt: now,
    });
    return ticket;
  }

  async findHumanReviewTicketById(id: string): Promise<HumanReviewTicket | undefined> {
    const [row] = await this.db
      .select({ payload: reviewTickets.payload })
      .from(reviewTickets)
      .where(eq(reviewTickets.id, id))
      .limit(1);
    return row?.payload;
  }

  async listHumanReviewTickets(
    options: ListHumanReviewTicketsOptions = {},
  ): Promise<HumanReviewTicket[]> {
    const status = options.status ?? 'pending';
    const where =
      options.tenantId === undefined
        ? status === 'all'
          ? undefined
          : eq(reviewTickets.status, status)
        : status === 'all'
          ? eq(reviewTickets.tenantId, options.tenantId)
          : and(eq(reviewTickets.tenantId, options.tenantId), eq(reviewTickets.status, status));
    const query = this.db
      .select({ payload: reviewTickets.payload })
      .from(reviewTickets)
      .orderBy(desc(reviewTickets.createdAt))
      .limit(options.limit ?? 50);
    const rows =
      where === undefined
        ? await query
        : await this.db
            .select({ payload: reviewTickets.payload })
            .from(reviewTickets)
            .where(where)
            .orderBy(desc(reviewTickets.createdAt))
            .limit(options.limit ?? 50);
    return rows.map((row) => row.payload);
  }

  async submitHumanReviewDecision(
    id: string,
    input: SubmitHumanReviewDecisionInput,
  ): Promise<HumanReviewTicket | undefined> {
    const ticket = await this.findHumanReviewTicketById(id);
    if (ticket === undefined) return undefined;
    const now = new Date();
    const feedback: HumanReviewFeedback = {
      id: randomUUID(),
      reviewerId: input.reviewerId,
      agentDecision: ticket.agentDecision,
      finalDecision: input.finalDecision,
      feedbackType: input.feedbackType,
      comment: redactSensitiveText(input.comment),
      falsePositive: input.falsePositive,
      falseNegative: input.falseNegative,
      createdAt: now.toISOString(),
    };
    const updated: HumanReviewTicket = {
      ...ticket,
      status: 'completed',
      feedback,
    };
    const redactedUpdated = redactJson(updated);
    await this.db.transaction(async (tx) => {
      await tx.insert(humanReviewFeedback).values({
        id: feedback.id,
        reviewTicketId: ticket.id,
        auditRunId: ticket.auditRunId,
        tenantId: ticket.tenantId,
        reviewerId: input.reviewerId,
        agentDecision: ticket.agentDecision,
        finalDecision: input.finalDecision,
        feedbackType: input.feedbackType,
        decision: input.finalDecision,
        commentRedacted: feedback.comment,
        payload: {
          agentDecision: ticket.agentDecision,
          finalDecision: input.finalDecision,
          feedbackType: input.feedbackType,
          falsePositive: input.falsePositive,
          falseNegative: input.falseNegative,
        },
        createdAt: now,
      });
      await tx
        .update(reviewTickets)
        .set({
          status: 'completed',
          payload: redactedUpdated,
          updatedAt: now,
        })
        .where(eq(reviewTickets.id, ticket.id));
    });
    return redactedUpdated;
  }

  async createRuleImprovementSuggestion(
    input: CreateRuleImprovementSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined> {
    const ticket = await this.findHumanReviewTicketById(input.reviewTicketId);
    if (ticket === undefined) return undefined;
    const firstFinding = ticket.findings[0];
    const now = new Date().toISOString();
    const category = input.category ?? firstFinding?.category;
    const ruleId = input.ruleId ?? firstFinding?.ruleId;
    const suggestion: RuleImprovementSuggestion = {
      id: `rule_suggestion_${randomUUID()}`,
      reviewTicketId: ticket.id,
      auditRunId: ticket.auditRunId,
      tenantId: ticket.tenantId,
      feedbackType: input.feedbackType ?? ticket.feedback?.feedbackType ?? 'VALID_RESULT',
      ...(category === undefined ? {} : { category }),
      ...(ruleId === undefined ? {} : { ruleId }),
      title: redactSensitiveText(input.title ?? `Review ${ticket.id} rule improvement`),
      description: redactSensitiveText(
        input.description ?? ticket.feedback?.comment ?? ticket.summary,
      ),
      status: 'open',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(ruleImprovementSuggestions).values({
      id: suggestion.id,
      reviewTicketId: suggestion.reviewTicketId,
      auditRunId: suggestion.auditRunId,
      tenantId: suggestion.tenantId,
      feedbackType: suggestion.feedbackType,
      category: suggestion.category ?? null,
      ruleId: suggestion.ruleId ?? null,
      title: suggestion.title,
      descriptionRedacted: suggestion.description,
      status: suggestion.status,
      createdBy: suggestion.createdBy,
      payload: suggestion,
      createdAt: new Date(suggestion.createdAt),
      updatedAt: new Date(suggestion.updatedAt),
    });
    return suggestion;
  }

  async listRuleImprovementSuggestions(
    options: ListRuleImprovementSuggestionsOptions = {},
  ): Promise<RuleImprovementSuggestion[]> {
    const status = options.status ?? 'open';
    const where =
      options.tenantId === undefined
        ? status === 'all'
          ? undefined
          : eq(ruleImprovementSuggestions.status, status)
        : status === 'all'
          ? eq(ruleImprovementSuggestions.tenantId, options.tenantId)
          : and(
              eq(ruleImprovementSuggestions.tenantId, options.tenantId),
              eq(ruleImprovementSuggestions.status, status),
            );
    const rows =
      where === undefined
        ? await this.db
            .select({ payload: ruleImprovementSuggestions.payload })
            .from(ruleImprovementSuggestions)
            .orderBy(desc(ruleImprovementSuggestions.createdAt))
            .limit(options.limit ?? 100)
        : await this.db
            .select({ payload: ruleImprovementSuggestions.payload })
            .from(ruleImprovementSuggestions)
            .where(where)
            .orderBy(desc(ruleImprovementSuggestions.createdAt))
            .limit(options.limit ?? 100);
    return rows.map((row) => row.payload);
  }

  async resolveRuleImprovementSuggestion(
    id: string,
    input: ResolveRuleImprovementSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined> {
    const [row] = await this.db
      .select({ payload: ruleImprovementSuggestions.payload })
      .from(ruleImprovementSuggestions)
      .where(eq(ruleImprovementSuggestions.id, id))
      .limit(1);
    if (row === undefined) return undefined;
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const updated: RuleImprovementSuggestion = {
      ...row.payload,
      status: 'resolved',
      resolvedBy: input.resolvedBy,
      ...(input.resolutionComment === undefined
        ? {}
        : { resolutionComment: redactSensitiveText(input.resolutionComment) }),
      updatedAt: now,
      resolvedAt: now,
    };
    await this.db
      .update(ruleImprovementSuggestions)
      .set({
        status: 'resolved',
        resolvedBy: input.resolvedBy,
        resolutionCommentRedacted: updated.resolutionComment ?? null,
        payload: updated,
        updatedAt: nowDate,
        resolvedAt: nowDate,
      })
      .where(eq(ruleImprovementSuggestions.id, id));
    return updated;
  }

  private async findJobPostingForAuditRun(
    auditRunId: string,
  ): Promise<JobPostingInput | undefined> {
    const [row] = await this.db
      .select({ inputPayload: jobPostings.inputPayload })
      .from(auditRuns)
      .innerJoin(jobPostings, eq(auditRuns.jobPostingId, jobPostings.id))
      .where(eq(auditRuns.id, auditRunId))
      .limit(1);
    return row?.inputPayload;
  }

  private buildHumanReviewTicket(
    result: AuditResult,
    jobPosting?: JobPostingInput,
  ): HumanReviewTicket {
    return {
      id: result.auditId,
      auditRunId: result.auditId,
      tenantId: result.context.tenantId,
      status: 'pending',
      findings: result.findings,
      riskLevel: result.riskLevel,
      suggestedAction: result.decision,
      agentDecision: result.decision,
      summary: result.summary,
      ...(jobPosting === undefined ? {} : { jobPosting: redactJson(jobPosting) }),
      auditResult: result,
      createdAt: result.createdAt,
    };
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async healthCheck(): Promise<{ status: 'up' | 'down' }> {
    try {
      await this.pool.query('select 1');
      return { status: 'up' };
    } catch {
      return { status: 'down' };
    }
  }
}
