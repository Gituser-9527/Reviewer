import { PostgresLLMPersistenceRepository, type AsyncJobEntity } from '@job-compliance/database';
import type { LLMProvider } from '@job-compliance/core';
import type { TenantLLMProviderResolver } from '../settings/provider-resolver.js';
import {
  validateExplanationRuntime,
  validateRewriteRuntime,
} from './enrichment-runtime-validation.js';
import {
  PostgresAuditEnrichmentContextLoader,
  type AuditEnrichmentContext,
} from './enrichment-context-loader.js';
import { calculateRewriteFindingCoverage } from './rewrite-finding-coverage.js';
import {
  ProductionRewriteRuleEngineAdapter,
  type RewriteRuleEngineAdapter,
} from './rewrite-rule-engine-adapter.js';
import { decideRewriteSafety } from './rewrite-secondary-review.js';
import { RewriteSemanticClassifierAdapter } from './rewrite-semantic-classifier-adapter.js';
import { RewriteReflectionAdapter } from './rewrite-reflection-adapter.js';

export const enrichmentTypes = ['AUDIT_GENERATE_EXPLANATIONS', 'AUDIT_GENERATE_REWRITE'] as const;
export type EnrichmentType = (typeof enrichmentTypes)[number];
export interface EnrichmentJobPayload {
  tenantId: string;
  auditRunId: string;
  jobType: EnrichmentType;
  promptVersion: string;
  modelVersion?: string;
  connectionId?: string;
  idempotencyKey: string;
}
export interface EnrichmentRepository {
  releaseExpiredLocks(): Promise<number>;
  claimNext(
    workerId: string,
    types: string[],
    lockDurationMs: number,
  ): Promise<AsyncJobEntity | null>;
  completeJob(id: string, result: unknown): Promise<void>;
  retryJob(id: string, errorCode: string, availableAt: Date): Promise<void>;
  deadLetter(id: string, errorCode: string): Promise<void>;
  createUsage(input: {
    tenantId: string;
    auditRunId?: string;
    asyncJobId?: string;
    connectionId?: string;
    provider: string;
    model: string;
    taskType?: string;
    promptVersion?: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    success?: boolean;
    errorCode?: string;
    isMock: boolean;
  }): Promise<unknown>;
  saveEnrichment?(input: {
    tenantId: string;
    auditRunId: string;
    taskType: string;
    status: string;
    result?: unknown;
    safetyResult?: unknown;
    errorCode?: string;
    promptVersion?: string;
    provider?: string;
    model?: string;
    isMock: boolean;
  }): Promise<void>;
}
export interface RuntimeProviderResolver {
  resolve(input: {
    tenantId: string;
    taskType: 'EXPLANATION' | 'REWRITE';
    connectionId?: string;
  }): Promise<{
    provider: LLMProvider;
    connectionId: string;
    providerName: string;
    model: string;
    isMock: boolean;
  }>;
}
export interface EnrichmentContextLoader {
  load(input: { tenantId: string; auditRunId: string }): Promise<AuditEnrichmentContext>;
}
function protectedFacts(job: AuditEnrichmentContext['originalJob']): {
  companyName?: string;
  location?: string;
  salary?: string;
  employmentType?: string;
} {
  return {
    ...(job.companyName === undefined ? {} : { companyName: job.companyName }),
    ...(job.location === undefined ? {} : { location: job.location }),
    ...(job.salary === undefined ? {} : { salary: job.salary }),
    ...(job.employmentType === undefined ? {} : { employmentType: job.employmentType }),
  };
}
export class TenantEnrichmentProviderResolver implements RuntimeProviderResolver {
  constructor(private readonly resolver: TenantLLMProviderResolver) {}
  async resolve(input: {
    tenantId: string;
    taskType: 'EXPLANATION' | 'REWRITE';
    connectionId?: string;
  }) {
    const value = input.connectionId
      ? await this.resolver.resolveConnection(input.tenantId, input.connectionId)
      : await this.resolver.resolveDefault(
          input.tenantId,
          input.taskType === 'EXPLANATION' ? 'EXPLANATION' : 'REWRITE',
        );
    return { ...value, isMock: false };
  }
}

/** Deterministic provider used unless a separately configured provider is injected. */
export class MockEnrichmentProvider {
  async generate(
    type: EnrichmentType,
    payload: EnrichmentJobPayload,
  ): Promise<Record<string, unknown>> {
    return type === 'AUDIT_GENERATE_EXPLANATIONS'
      ? {
          auditRunId: payload.auditRunId,
          summary: '该结果由规则与可追溯证据生成，建议结合人工复核流程处理。',
          findings: [],
          limitations: ['Mock result'],
        }
      : {
          description: '请使用中性、明确且不包含收费或敏感个人信息要求的招聘表述。',
          changes: [],
          preservedFacts: [],
          warnings: [],
        };
  }
}
export class EnrichmentWorker {
  constructor(
    private readonly repository: EnrichmentRepository,
    private readonly provider?: MockEnrichmentProvider,
    private readonly workerId = process.env.WORKER_ID ?? `enrichment-${process.pid}`,
    private readonly resolver?: RuntimeProviderResolver,
    private readonly contextLoader?: EnrichmentContextLoader,
    private readonly ruleEngineAdapter?: RewriteRuleEngineAdapter,
    private readonly semanticClassifierAdapter?: RewriteSemanticClassifierAdapter,
    private readonly reflectionAdapter?: RewriteReflectionAdapter,
  ) {}
  async runOnce(): Promise<boolean> {
    await this.repository.releaseExpiredLocks();
    const job = await this.repository.claimNext(this.workerId, [...enrichmentTypes], 30_000);
    if (!job) return false;
    const started = Date.now();
    const payload = job.payload as unknown as EnrichmentJobPayload;
    let resolved:
      | { provider: string; model: string; isMock: boolean; connectionId?: string }
      | undefined;
    let completionUsage: { inputTokens?: number; outputTokens?: number } | undefined;
    try {
      if (
        !enrichmentTypes.includes(job.type as EnrichmentType) ||
        payload.tenantId !== job.tenantId
      )
        throw new Error('JOB_PAYLOAD_INVALID');
      const context = this.contextLoader
        ? await this.contextLoader.load({ tenantId: job.tenantId, auditRunId: payload.auditRunId })
        : undefined;
      if (context && context.findings.length === 0) throw new Error('NO_FINDINGS_AVAILABLE');
      let result: Record<string, unknown>;
      if (this.resolver) {
        const r = await this.resolver.resolve({
          tenantId: job.tenantId,
          taskType: job.type === 'AUDIT_GENERATE_EXPLANATIONS' ? 'EXPLANATION' : 'REWRITE',
          ...(payload.connectionId === undefined ? {} : { connectionId: payload.connectionId }),
        });
        resolved = {
          provider: r.providerName,
          model: r.model,
          isMock: r.isMock,
          connectionId: r.connectionId,
        };
        const completion = await r.provider.complete(
          [
            {
              role: 'user',
              content: `Return JSON only for ${payload.jobType}; audit run ${payload.auditRunId}; findings ${context?.findings.map((f) => f.id).join(',') ?? ''}.`,
            },
          ],
          { responseFormat: 'json_object', maxTokens: 512 },
        );
        completionUsage = {
          ...(completion.usage?.promptTokens === undefined
            ? {}
            : { inputTokens: completion.usage.promptTokens }),
          ...(completion.usage?.completionTokens === undefined
            ? {}
            : { outputTokens: completion.usage.completionTokens }),
        };
        result = JSON.parse(completion.content) as Record<string, unknown>;
      } else if (this.provider) {
        result = await this.provider.generate(job.type as EnrichmentType, payload);
        resolved = { provider: 'MOCK', model: 'mock-enrichment-v1', isMock: true };
      } else throw new Error('NO_ACTIVE_LLM_CONNECTION');
      let safetyResult: unknown;
      if (job.type === 'AUDIT_GENERATE_EXPLANATIONS') {
        const valid = validateExplanationRuntime(
          result,
          payload.auditRunId,
          new Set(context?.findings.map((f) => f.id) ?? []),
          new Set(context?.evidence.map((e) => e.id) ?? []),
        );
        if (!valid.ok) throw new Error(valid.code);
      } else {
        if (!context) throw new Error('AUDIT_CONTEXT_REQUIRED');
        const valid = validateRewriteRuntime(
          result,
          protectedFacts(context.originalJob),
          new Set(context.findings.map((f) => f.id)),
        );
        if (!valid.ok) throw new Error(valid.code);
        const findingCoverage = calculateRewriteFindingCoverage({
          findings: context.findings,
          originalJob: context.originalJob,
          rewrite: valid.value,
        });
        if (!this.ruleEngineAdapter) throw new Error('REWRITE_RULE_ENGINE_UNAVAILABLE');
        const ruleEngineReview = await this.ruleEngineAdapter.review({
          context,
          rewrite: valid.value,
        });
        const semanticReview = await (
          this.semanticClassifierAdapter ?? new RewriteSemanticClassifierAdapter()
        ).review({
          context,
          rewrite: valid.value,
          findingCoverage,
          rewriteSafety: valid.safety,
          ruleEngineReview,
        });
        const reflectionReview = await (
          this.reflectionAdapter ?? new RewriteReflectionAdapter()
        ).review({
          context,
          rewrite: valid.value,
          findingCoverage,
          rewriteSafety: valid.safety,
          ruleEngineReview,
          semanticReview,
        });
        const secondaryReview = decideRewriteSafety({
          protectedFactViolations: valid.safety.protectedFactViolations,
          ungroundedFacts: [],
          criticalRiskRemaining: false,
          highRiskRemaining: false,
          newHighRisk: false,
          semantic: semanticReview.status,
          reflection: reflectionReview.status,
          hallucinationDetected: false,
          findingCoverage,
          ruleEngineReview,
        });
        safetyResult = {
          rewriteSafety: valid.safety,
          findingCoverage,
          ruleEngineReview,
          semanticReview,
          reflectionReview,
          secondaryReview,
        };
      }
      await this.repository.saveEnrichment?.({
        tenantId: job.tenantId,
        auditRunId: payload.auditRunId,
        taskType: job.type,
        status: 'COMPLETED',
        result,
        ...(safetyResult === undefined ? {} : { safetyResult }),
        promptVersion: payload.promptVersion,
        provider: resolved.provider,
        model: resolved.model,
        isMock: resolved.isMock,
      });
      await this.repository.completeJob(job.id, result);
      await this.repository.createUsage({
        tenantId: job.tenantId,
        ...(job.auditRunId === undefined ? {} : { auditRunId: job.auditRunId }),
        asyncJobId: job.id,
        ...(resolved.connectionId === undefined ? {} : { connectionId: resolved.connectionId }),
        provider: resolved.provider,
        model: resolved.model,
        taskType: job.type,
        promptVersion: payload.promptVersion,
        ...(completionUsage === undefined ? {} : completionUsage),
        durationMs: Date.now() - started,
        success: true,
        isMock: resolved.isMock,
      });
      return true;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'PROVIDER_UNAVAILABLE';
      const noRequest =
        code === 'NO_ACTIVE_LLM_CONNECTION' ||
        code === 'JOB_PAYLOAD_INVALID' ||
        code === 'NO_FINDINGS_AVAILABLE';
      if (noRequest) {
        await this.repository.saveEnrichment?.({
          tenantId: job.tenantId,
          auditRunId: payload.auditRunId,
          taskType: job.type,
          status: 'SKIPPED',
          errorCode: code,
          promptVersion: payload.promptVersion,
          isMock: false,
        });
        await this.repository.deadLetter(job.id, code);
        return true;
      }
      if (job.attemptCount >= job.maxAttempts) await this.repository.deadLetter(job.id, code);
      else
        await this.repository.retryJob(
          job.id,
          code,
          new Date(Date.now() + Math.min(60_000, 1000 * 2 ** job.attemptCount)),
        );
      await this.repository.saveEnrichment?.({
        tenantId: job.tenantId,
        auditRunId: payload.auditRunId,
        taskType: job.type,
        status: job.attemptCount >= job.maxAttempts ? 'DEAD_LETTER' : 'RETRY_WAIT',
        errorCode: code,
        promptVersion: payload.promptVersion,
        isMock: resolved?.isMock ?? false,
      });
      if (resolved)
        await this.repository.createUsage({
          tenantId: job.tenantId,
          ...(job.auditRunId === undefined ? {} : { auditRunId: job.auditRunId }),
          asyncJobId: job.id,
          provider: resolved.provider,
          model: resolved.model,
          taskType: job.type,
          promptVersion: payload.promptVersion,
          durationMs: Date.now() - started,
          success: false,
          errorCode: code,
          isMock: resolved.isMock,
        });
      return true;
    }
  }
}

async function main(): Promise<void> {
  const repository = new PostgresLLMPersistenceRepository();
  const worker = new EnrichmentWorker(
    repository,
    undefined,
    undefined,
    undefined,
    new PostgresAuditEnrichmentContextLoader(repository.pool),
    new ProductionRewriteRuleEngineAdapter(),
    new RewriteSemanticClassifierAdapter(),
    new RewriteReflectionAdapter(),
  );
  const once = process.argv.includes('--once');
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  do {
    const worked = await worker.runOnce();
    if (once || !worked) {
      if (!once) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } while (!once && !stopping);
  await repository.close();
}
if (process.argv[1]?.includes('enrichment-worker')) void main();
