import { fileURLToPath } from 'node:url';
import {
  auditJobPosting,
  LocalKnowledgeRetriever,
  MockEvidenceRetriever,
  YamlRuleEngine,
} from '@job-compliance/core';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import type { FastifyInstance } from 'fastify';
import {
  auditJobRequestSchema,
  auditRunGetQuerySchema,
  auditRunListQuerySchema,
  auditRunParamsSchema,
  type AuditJobRequest,
} from './schemas.js';
import type { AuditRunStore } from './store.js';
import type { AuthServices } from '../auth/service.js';
import type { BetaTrialService } from '../beta-trial/service.js';
import type { IncidentResponseService } from '../incidents/service.js';
import type { PerformanceServices } from '../performance/service.js';
import type { HumanReviewStore } from '../reviews/store.js';
import { FileRuleManagementStore } from '../rules/store.js';
import type { RuntimeServices, RuntimeSelection } from '../runtime/services.js';

/** Function signature used to invoke the core audit orchestrator. */
export type AuditJobHandler = (
  input: JobPostingInput,
  request: AuditJobRequest,
  runtime?: RuntimeSelection,
) => Promise<AuditResult>;

/** Dependencies required by audit API routes. */
export interface AuditRoutesDependencies {
  /** Storage used for completed audit runs. */
  store: AuditRunStore;
  /** Optional human review store used to auto-create tickets for MANUAL_REVIEW results. */
  reviewStore?: HumanReviewStore;
  /** Optional audit function override used by tests. */
  auditJob?: AuditJobHandler;
  /** Optional runtime, rollout, metrics and alert services. */
  runtimeServices?: RuntimeServices;
  /** Optional beta trial service used to record non-blocking trial runs. */
  betaTrialService?: BetaTrialService;
  /** Optional auth services used for RBAC and tenant isolation. */
  authServices?: AuthServices;
  /** Optional product service used for API key quota and webhook delivery. */
  productService?: {
    extractApiKey(headers: Record<string, unknown>): string | undefined;
    authenticateApiKey(apiKey: string): { apiKeyId: string; tenantId: string };
    assertQuota(tenantId: string, quantity: number): void;
    recordUsage(input: {
      tenantId: string;
      quantity: number;
      apiKeyId?: string;
      metadata?: Record<string, unknown>;
    }): unknown;
    notifyWebhooks(
      tenantId: string,
      event: 'audit.completed',
      payload: unknown,
    ): Promise<unknown[]>;
  };
  /** Optional performance services for timeout fallback, rate limits and cost tracking. */
  performanceServices?: PerformanceServices;
  /** Optional incident response service used to apply emergency runtime switches. */
  incidentResponseService?: IncidentResponseService;
}

const knowledgeDirectory = fileURLToPath(new URL('../../../../knowledge/', import.meta.url));
const localEvidenceRetriever = new LocalKnowledgeRetriever(knowledgeDirectory);
const ruleManagementStore = new FileRuleManagementStore();

export function toCoreInput(request: AuditJobRequest): JobPostingInput {
  return {
    externalId: request.jobPostingId,
    title: request.job.title,
    description: request.job.description,
    companyName: request.company.name,
    ...(request.job.location === undefined ? {} : { location: request.job.location }),
    ...(request.job.employmentType === undefined
      ? {}
      : { employmentType: request.job.employmentType.toUpperCase() }),
    ...(request.job.salary === undefined ? {} : { salary: { text: request.job.salary } }),
    ...(request.job.responsibilities === undefined
      ? {}
      : { responsibilities: request.job.responsibilities }),
    ...(request.job.requirements === undefined ? {} : { requirements: request.job.requirements }),
    metadata: {
      enableRewrite: request.options.enableRewrite,
      enableRag: request.options.enableRag,
    },
  };
}

export const defaultAuditJob: AuditJobHandler = async (input, request, runtime) => {
  const fallbackRuleVersion = await ruleManagementStore.getCurrentRuleVersion(
    request.options.jurisdiction,
  );
  const ruleVersion = runtime?.ruleVersion ?? fallbackRuleVersion;
  const selectedRulesDirectory = await ruleManagementStore.getRulesDirectoryForVersion(
    request.options.jurisdiction,
    ruleVersion,
  );
  const ruleEngine = await YamlRuleEngine.fromDirectory(selectedRulesDirectory);
  return auditJobPosting(input, {
    tenantId: request.tenantId,
    jurisdiction: request.options.jurisdiction,
    ruleEngine,
    ruleVersion,
    ...(runtime?.lawKbVersion === undefined ? {} : { lawKbVersion: runtime.lawKbVersion }),
    ...(runtime?.modelVersion === undefined ? {} : { modelVersion: runtime.modelVersion }),
    evidenceRetriever: request.options.enableRag
      ? localEvidenceRetriever
      : new MockEvidenceRetriever(),
  });
};

/** Registers audit submission and retrieval routes. */
export function registerAuditRoutes(
  app: FastifyInstance,
  dependencies: AuditRoutesDependencies,
): void {
  const auditJob = dependencies.auditJob ?? defaultAuditJob;

  app.post('/api/audit/job', async (request, reply) => {
    const startedAt = Date.now();
    try {
      dependencies.authServices?.authService.requirePermission(request, 'audit:write');
      const body = auditJobRequestSchema.parse(request.body);
      const apiKey = dependencies.productService?.extractApiKey(
        request.headers as Record<string, unknown>,
      );
      const apiKeyContext =
        apiKey === undefined ? undefined : dependencies.productService?.authenticateApiKey(apiKey);
      if (apiKeyContext === undefined) {
        dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
      } else {
        if (apiKeyContext.tenantId !== body.tenantId) {
          return reply.code(403).send({
            requestId: request.id,
            error: {
              code: 'API_KEY_TENANT_MISMATCH',
              message: 'API key does not belong to the request tenant.',
              retryable: false,
            },
          });
        }
        dependencies.productService?.assertQuota(body.tenantId, 1);
      }
      dependencies.performanceServices?.rateLimitService.assertAllowed({
        tenantId: body.tenantId,
        quantity: 1,
        ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
      });
      const input = toCoreInput(body);
      const runtime = dependencies.runtimeServices?.runtimeConfigService.resolveForTenant(
        body.tenantId,
      );
      const emergencySwitches = dependencies.incidentResponseService?.activeSwitchMap();
      const effectiveRuntime =
        emergencySwitches?.disable_llm === true
          ? {
              ...(runtime ?? {
                ruleVersion: '1.0.0',
                lawKbVersion: 'local-2026-06-12',
                modelVersion: 'mock-none',
                rolloutMatches: [],
              }),
              modelVersion: 'llm-disabled-by-emergency-switch',
            }
          : runtime;
      const result =
        dependencies.performanceServices === undefined
          ? await auditJob(input, body, effectiveRuntime)
          : await dependencies.performanceServices.fallbackPolicyService.runAuditWithFallback(
              () => auditJob(input, body, effectiveRuntime),
              () => defaultAuditJob(input, body, effectiveRuntime),
            );
      const finalResult = dependencies.incidentResponseService?.applyAuditSwitches(result) ?? result;
      await dependencies.store.save(finalResult, {
        tenantId: body.tenantId,
        jobPosting: input,
      });
      dependencies.betaTrialService?.recordAgentRun(finalResult);
      if (finalResult.decision === 'MANUAL_REVIEW') {
        await dependencies.reviewStore?.createFromAuditResult(finalResult, input);
      }
      const metrics = dependencies.runtimeServices?.metricsService.recordAuditResult(
        finalResult,
        Date.now() - startedAt,
      );
      if (metrics !== undefined) {
        dependencies.runtimeServices?.alertService.evaluate(metrics);
      }
      if (apiKeyContext !== undefined) {
        dependencies.productService?.recordUsage({
          tenantId: body.tenantId,
          quantity: 1,
          apiKeyId: apiKeyContext.apiKeyId,
          metadata: { auditId: finalResult.auditId },
        });
        await dependencies.productService?.notifyWebhooks(body.tenantId, 'audit.completed', finalResult);
      }
      dependencies.performanceServices?.rateLimitService.record({
        tenantId: body.tenantId,
        quantity: 1,
        ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
      });
      dependencies.performanceServices?.costTrackingService.recordAudit({
        tenantId: body.tenantId,
        ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
        auditId: finalResult.auditId,
        ragNoResult: finalResult.findings.length > 0 && finalResult.evidence.length === 0,
      });
      return reply.code(201).send(finalResult);
    } catch (error) {
      const metrics = dependencies.runtimeServices?.metricsService.recordApiError();
      if (metrics !== undefined) {
        dependencies.runtimeServices?.alertService.evaluate(metrics);
      }
      throw error;
    }
  });

  app.get('/api/audit/runs', async (request, reply) => {
    const query = auditRunListQuerySchema.parse(request.query);
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantAccess(request, query.tenantId);
    const items = await dependencies.store.listByTenant(query.tenantId);
    return reply.send({ items });
  });

  app.get('/api/audit/runs/:id', async (request, reply) => {
    const params = auditRunParamsSchema.parse(request.params);
    const query = auditRunGetQuerySchema.parse(request.query);
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    if (query.tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, query.tenantId);
    }
    const result = await dependencies.store.findById(params.id, query.tenantId);
    if (result !== undefined && query.tenantId === undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, result.context.tenantId);
    }
    if (result === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'AUDIT_RUN_NOT_FOUND',
          message: 'Audit run was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(result);
  });
}
