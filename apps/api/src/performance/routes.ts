import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import type { FastifyInstance } from 'fastify';
import {
  defaultAuditJob,
  toCoreInput,
  type AuditJobHandler,
} from '../audit/routes.js';
import { auditJobRequestSchema, type AuditJobRequest } from '../audit/schemas.js';
import type { AuditRunStore } from '../audit/store.js';
import type { AuthServices } from '../auth/service.js';
import type { BetaTrialService } from '../beta-trial/service.js';
import type { ProductService } from '../product/service.js';
import type { HumanReviewStore } from '../reviews/store.js';
import type { RuntimeServices } from '../runtime/services.js';
import {
  batchAuditSchema,
  batchParamsSchema,
  tenantLimitParamsSchema,
  updateTenantLimitsSchema,
  usageQuerySchema,
} from './schemas.js';
import { RateLimitError, type PerformanceServices } from './service.js';
import type { RateLimitConfig } from './service.js';

export interface PerformanceRoutesDependencies {
  services: PerformanceServices;
  auditRunStore: AuditRunStore;
  reviewStore?: HumanReviewStore;
  runtimeServices?: RuntimeServices;
  betaTrialService?: BetaTrialService;
  authServices?: AuthServices;
  productService?: ProductService;
  auditJob?: AuditJobHandler;
}

function notFound(requestId: string, code: string, message: string): Record<string, unknown> {
  return {
    requestId,
    error: { code, message, retryable: false },
  };
}

function rateLimitResponse(requestId: string, error: RateLimitError): Record<string, unknown> {
  return {
    requestId,
    error: {
      code: error.code,
      message: error.message,
      retryable: true,
    },
  };
}

function compactLimitConfig(input: Record<string, number | undefined>): Partial<RateLimitConfig> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<RateLimitConfig>;
}

async function persistAuditResult(
  input: {
    result: AuditResult;
    coreInput: JobPostingInput;
    request: AuditJobRequest;
    startedAt: number;
  },
  dependencies: PerformanceRoutesDependencies,
): Promise<void> {
  await dependencies.auditRunStore.save(input.result, {
    tenantId: input.request.tenantId,
    jobPosting: input.coreInput,
  });
  dependencies.betaTrialService?.recordAgentRun(input.result);
  if (input.result.decision === 'MANUAL_REVIEW') {
    await dependencies.reviewStore?.createFromAuditResult(input.result, input.coreInput);
  }
  const metrics = dependencies.runtimeServices?.metricsService.recordAuditResult(
    input.result,
    Date.now() - input.startedAt,
  );
  if (metrics !== undefined) {
    dependencies.runtimeServices?.alertService.evaluate(metrics);
  }
}

export function registerPerformanceRoutes(
  app: FastifyInstance,
  dependencies: PerformanceRoutesDependencies,
): void {
  const auditJob = dependencies.auditJob ?? defaultAuditJob;
  const fallbackPolicy = dependencies.services.fallbackPolicyService;

  app.post('/api/audit/batch', async (request, reply) => {
    const body = batchAuditSchema.parse(request.body);
    const apiKey = dependencies.productService?.extractApiKey(
      request.headers as Record<string, unknown>,
    );
    const apiKeyContext =
      apiKey === undefined ? undefined : dependencies.productService?.authenticateApiKey(apiKey);
    if (apiKeyContext === undefined) {
      dependencies.authServices?.authService.requirePermission(request, 'audit:write');
      dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    } else if (apiKeyContext.tenantId !== body.tenantId) {
      return reply.code(403).send({
        requestId: request.id,
        error: {
          code: 'API_KEY_TENANT_MISMATCH',
          message: 'API key does not belong to the request tenant.',
          retryable: false,
        },
      });
    }

    try {
      dependencies.services.rateLimitService.assertAllowed({
        tenantId: body.tenantId,
        quantity: body.jobs.length,
        ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        return reply.code(429).send(rateLimitResponse(request.id, error));
      }
      throw error;
    }
    dependencies.productService?.assertQuota(body.tenantId, body.jobs.length);
    dependencies.productService?.recordUsage({
      tenantId: body.tenantId,
      quantity: body.jobs.length,
      ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
      metadata: { source: 'batch_async' },
    });
    dependencies.services.rateLimitService.record({
      tenantId: body.tenantId,
      quantity: body.jobs.length,
      ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
    });

    const batch = dependencies.services.queueService.enqueueBatch({
      tenantId: body.tenantId,
      jobs: body.jobs.map((job) => ({
        jobPostingId: job.jobPostingId,
        request: auditJobRequestSchema.parse({
          tenantId: body.tenantId,
          jobPostingId: job.jobPostingId,
          company: job.company,
          job: job.job,
          options: job.options ?? {},
        }),
      })),
      processor: async (item) => {
        const startedAt = Date.now();
        const coreInput = toCoreInput(item.request);
        const runtime = dependencies.runtimeServices?.runtimeConfigService.resolveForTenant(
          item.request.tenantId,
        );
        const result = await fallbackPolicy.runAuditWithFallback(
          () => auditJob(coreInput, item.request, runtime),
          () => defaultAuditJob(coreInput, item.request, runtime),
        );
        await persistAuditResult({ result, coreInput, request: item.request, startedAt }, dependencies);
        dependencies.services.costTrackingService.recordAudit({
          tenantId: item.request.tenantId,
          ...(apiKeyContext === undefined ? {} : { apiKeyId: apiKeyContext.apiKeyId }),
          auditId: result.auditId,
          batchId: item.batchId,
          itemId: item.itemId,
          ragNoResult: result.findings.length > 0 && result.evidence.length === 0,
        });
        return { auditRunId: result.auditId };
      },
      onBatchComplete: async (completedBatch) => {
        await dependencies.productService?.notifyWebhooks(
          body.tenantId,
          'batch.completed',
          completedBatch,
        );
      },
    });

    return reply.code(202).send(batch);
  });

  app.get('/api/audit/batch/:id', async (request, reply) => {
    const params = batchParamsSchema.parse(request.params);
    const batch = dependencies.services.queueService.getBatch(params.id);
    if (batch === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BATCH_NOT_FOUND', 'Batch audit job was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, batch.tenantId);
    return reply.send(batch);
  });

  app.get('/api/audit/batch/:id/items', async (request, reply) => {
    const params = batchParamsSchema.parse(request.params);
    const batch = dependencies.services.queueService.getBatch(params.id);
    if (batch === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BATCH_NOT_FOUND', 'Batch audit job was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, batch.tenantId);
    return reply.send({ items: dependencies.services.queueService.listBatchItems(params.id) });
  });

  app.get('/api/usage/costs', async (request, reply) => {
    const query = usageQuerySchema.parse(request.query);
    dependencies.authServices?.authService.requireTenantAccess(request, query.tenantId);
    return reply.send(
      dependencies.services.costTrackingService.getUsage({
        tenantId: query.tenantId,
        ...(query.date === undefined ? {} : { date: query.date }),
      }),
    );
  });

  app.get('/api/usage/limits', async (request, reply) => {
    const query = usageQuerySchema.parse(request.query);
    dependencies.authServices?.authService.requireTenantAccess(request, query.tenantId);
    return reply.send(
      dependencies.services.rateLimitService.snapshot(query.tenantId, query.apiKeyId),
    );
  });

  app.patch('/api/usage/limits/:tenantId', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const params = tenantLimitParamsSchema.parse(request.params);
    const body = updateTenantLimitsSchema.parse(request.body);
    const updated = dependencies.services.rateLimitService.configureTenant(
      params.tenantId,
      compactLimitConfig(body),
    );
    return reply.send({
      tenantId: params.tenantId,
      limits: updated,
      updatedAt: new Date().toISOString(),
    });
  });
}
