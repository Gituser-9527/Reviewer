import { desc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Pool as PgPool } from 'pg';
import type { EvalCaseInput, EvalFailureRecord, EvalRunReport } from '@job-compliance/core';
import { redactSensitiveText } from './privacy.js';
import { evalCases, evalDatasets, evalFailures, evalRuns } from './schema.js';
import * as schema from './schema.js';

const { Pool } = pg;

export interface EvalDatasetRecord {
  id: string;
  name: string;
  version: string;
  description?: string;
  createdAt: string;
}

export interface CreateEvalDatasetInput {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface EvalRepository {
  createDataset(input: CreateEvalDatasetInput): Promise<EvalDatasetRecord>;
  listDatasets(): Promise<EvalDatasetRecord[]>;
  addCases(datasetId: string, cases: readonly EvalCaseInput[]): Promise<EvalCaseInput[]>;
  listCases(datasetId: string): Promise<EvalCaseInput[]>;
  saveRun(report: EvalRunReport): Promise<void>;
  listRuns(): Promise<EvalRunReport[]>;
  findRun(id: string): Promise<EvalRunReport | undefined>;
  listFailures(evalRunId: string): Promise<EvalFailureRecord[]>;
  close(): Promise<void>;
}

export interface PostgresEvalRepositoryOptions {
  connectionString?: string;
  pool?: PgPool;
}

export class PostgresEvalRepository implements EvalRepository {
  private readonly pool: PgPool;
  private readonly db: NodePgDatabase<typeof schema>;
  private readonly ownsPool: boolean;

  constructor(options: PostgresEvalRepositoryOptions = {}) {
    if (options.pool === undefined && options.connectionString === undefined) {
      throw new Error('PostgresEvalRepository requires a pool or connectionString.');
    }
    this.pool = options.pool ?? new Pool({ connectionString: options.connectionString });
    this.db = drizzle(this.pool, { schema });
    this.ownsPool = options.pool === undefined;
  }

  async createDataset(input: CreateEvalDatasetInput): Promise<EvalDatasetRecord> {
    const createdAt = new Date();
    const [row] = await this.db
      .insert(evalDatasets)
      .values({
        id: input.id,
        name: redactSensitiveText(input.name),
        version: input.version,
        description:
          input.description === undefined ? null : redactSensitiveText(input.description),
        createdAt,
      })
      .onConflictDoUpdate({
        target: evalDatasets.id,
        set: {
          name: redactSensitiveText(input.name),
          version: input.version,
          description:
            input.description === undefined ? null : redactSensitiveText(input.description),
        },
      })
      .returning();
    if (row === undefined) throw new Error('Failed to create eval dataset.');
    return toDatasetRecord(row);
  }

  async listDatasets(): Promise<EvalDatasetRecord[]> {
    const rows = await this.db.select().from(evalDatasets).orderBy(desc(evalDatasets.createdAt));
    return rows.map(toDatasetRecord);
  }

  async addCases(datasetId: string, cases: readonly EvalCaseInput[]): Promise<EvalCaseInput[]> {
    if (cases.length === 0) return [];
    const now = new Date();
    await this.db
      .insert(evalCases)
      .values(
        cases.map((entry) => ({
          id: entry.id,
          datasetId,
          source: entry.source,
          title: entry.title === undefined ? null : redactSensitiveText(entry.title),
          description: redactSensitiveText(entry.description),
          expectedDecision: entry.expectedDecision,
          expectedCategories: entry.expectedCategories,
          expectedSeverity: entry.expectedSeverity ?? null,
          humanReason:
            entry.humanReason === undefined ? null : redactSensitiveText(entry.humanReason),
          metadata: {
            ...(entry.metadata ?? {}),
            ...(entry.jobInput === undefined ? {} : { jobInput: entry.jobInput }),
          },
          createdAt: entry.createdAt === undefined ? now : new Date(entry.createdAt),
        })),
      )
      .onConflictDoNothing();
    return this.listCases(datasetId);
  }

  async listCases(datasetId: string): Promise<EvalCaseInput[]> {
    const rows = await this.db
      .select()
      .from(evalCases)
      .where(eq(evalCases.datasetId, datasetId))
      .orderBy(evalCases.createdAt);
    return rows.map((row) => {
      const metadata = row.metadata as Record<string, unknown> | null;
      const jobInput = metadata?.jobInput as EvalCaseInput['jobInput'] | undefined;
      return {
        id: row.id,
        datasetId: row.datasetId,
        source: row.source,
        ...(row.title === null ? {} : { title: row.title }),
        description: row.description,
        expectedDecision: row.expectedDecision as EvalCaseInput['expectedDecision'],
        expectedCategories: row.expectedCategories as EvalCaseInput['expectedCategories'],
        ...(row.expectedSeverity === null ? {} : { expectedSeverity: row.expectedSeverity }),
        ...(row.humanReason === null ? {} : { humanReason: row.humanReason }),
        ...(jobInput === undefined ? {} : { jobInput }),
        ...(metadata === null ? {} : { metadata }),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async saveRun(report: EvalRunReport): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(evalRuns)
        .values({
          id: report.id,
          datasetId: report.datasetId,
          ruleVersion: report.ruleVersion,
          lawKbVersion: report.lawKbVersion ?? null,
          modelVersion: report.modelVersion ?? null,
          totalCases: report.totalCases,
          passedCases: report.passedCases,
          failedCases: report.failedCases,
          decisionAccuracy: report.decisionAccuracy,
          categoryRecall: report.categoryRecall,
          categoryPrecision: report.categoryPrecision,
          highRiskRecall: report.criticalRecall,
          criticalRecall: report.criticalRecall,
          falsePositiveRate: report.falsePositiveRate,
          falseNegativeRate: report.falseNegativeRate,
          manualReviewRate: report.manualReviewRate,
          evidenceAccuracy: report.evidenceAccuracy,
          rewriteSafetyRate: report.rewriteSafetyRate,
          createdAt: new Date(report.createdAt),
        })
        .onConflictDoUpdate({
          target: evalRuns.id,
          set: {
            passedCases: report.passedCases,
            failedCases: report.failedCases,
            decisionAccuracy: report.decisionAccuracy,
            categoryRecall: report.categoryRecall,
            categoryPrecision: report.categoryPrecision,
            highRiskRecall: report.criticalRecall,
            criticalRecall: report.criticalRecall,
            falsePositiveRate: report.falsePositiveRate,
            falseNegativeRate: report.falseNegativeRate,
            manualReviewRate: report.manualReviewRate,
            evidenceAccuracy: report.evidenceAccuracy,
            rewriteSafetyRate: report.rewriteSafetyRate,
          },
        });
      await tx.delete(evalFailures).where(eq(evalFailures.evalRunId, report.id));
      if (report.failures.length > 0) {
        await tx.insert(evalFailures).values(
          report.failures.map((failure) => ({
            id: failure.id,
            evalRunId: failure.evalRunId,
            caseId: failure.caseId,
            expected: failure.expected,
            actual: failure.actual,
            failureType: failure.failureType,
            reason: failure.reason === undefined ? null : redactSensitiveText(failure.reason),
            createdAt: new Date(failure.createdAt),
          })),
        );
      }
    });
  }

  async listRuns(): Promise<EvalRunReport[]> {
    const rows = await this.db.select().from(evalRuns).orderBy(desc(evalRuns.createdAt)).limit(100);
    return Promise.all(rows.map((row) => this.toRunReport(row)));
  }

  async findRun(id: string): Promise<EvalRunReport | undefined> {
    const [row] = await this.db.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
    return row === undefined ? undefined : this.toRunReport(row);
  }

  async listFailures(evalRunId: string): Promise<EvalFailureRecord[]> {
    const rows = await this.db
      .select()
      .from(evalFailures)
      .where(eq(evalFailures.evalRunId, evalRunId))
      .orderBy(evalFailures.createdAt);
    return rows.map((row) => ({
      id: row.id,
      evalRunId: row.evalRunId,
      caseId: row.caseId,
      expected: row.expected as Record<string, unknown>,
      actual: row.actual as Record<string, unknown>,
      failureType: row.failureType,
      ...(row.reason === null ? {} : { reason: row.reason }),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  private async toRunReport(row: typeof evalRuns.$inferSelect): Promise<EvalRunReport> {
    const failures = await this.listFailures(row.id);
    return {
      id: row.id,
      datasetId: row.datasetId,
      ruleVersion: row.ruleVersion,
      ...(row.lawKbVersion === null ? {} : { lawKbVersion: row.lawKbVersion }),
      ...(row.modelVersion === null ? {} : { modelVersion: row.modelVersion }),
      totalCases: row.totalCases,
      passedCases: row.passedCases,
      failedCases: row.failedCases,
      decisionAccuracy: row.decisionAccuracy,
      categoryRecall: row.categoryRecall,
      categoryPrecision: row.categoryPrecision,
      criticalRecall: row.criticalRecall,
      falsePositiveRate: row.falsePositiveRate,
      falseNegativeRate: row.falseNegativeRate,
      manualReviewRate: row.manualReviewRate,
      evidenceAccuracy: row.evidenceAccuracy,
      rewriteSafetyRate: row.rewriteSafetyRate,
      failures,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function toDatasetRecord(row: typeof evalDatasets.$inferSelect): EvalDatasetRecord {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    ...(row.description === null ? {} : { description: row.description }),
    createdAt: row.createdAt.toISOString(),
  };
}
