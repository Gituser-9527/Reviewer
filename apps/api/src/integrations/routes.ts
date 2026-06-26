import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import type { FastifyInstance } from 'fastify';
import {
  defaultAuditJob,
  toCoreInput,
  type AuditJobHandler,
} from '../audit/routes.js';
import { auditJobRequestSchema, type AuditJobRequest } from '../audit/schemas.js';
import type { AuditRunStore } from '../audit/store.js';
import type { BetaTrialService } from '../beta-trial/service.js';
import type { PerformanceServices } from '../performance/service.js';
import type { ProductService } from '../product/service.js';
import type { HumanReviewStore } from '../reviews/store.js';
import type { RuntimeServices } from '../runtime/services.js';
import { openApiDocument } from './openapi.js';
import {
  v1AuditJobSchema,
  v1BatchAuditSchema,
  v1WebhookEndpointSchema,
  v1ParamsSchema,
  v1UsageQuerySchema,
  v1WebhookTestSchema,
  type V1BatchJobInput,
} from './schemas.js';
import {
  toStableAuditResponse,
  type IntegrationApiError,
  type IntegrationService,
  type StableBatchResponse,
} from './service.js';

export interface IntegrationRoutesDependencies {
  integrationService: IntegrationService;
  productService: ProductService;
  performanceServices: PerformanceServices;
  auditRunStore: AuditRunStore;
  reviewStore?: HumanReviewStore;
  runtimeServices?: RuntimeServices;
  betaTrialService?: BetaTrialService;
  auditJob?: AuditJobHandler;
}

function errorResponse(requestId: string, code: string, message: string): Record<string, unknown> {
  return {
    requestId,
    error: {
      code,
      message,
      retryable: code === 'RATE_LIMITED' || code === 'WEBHOOK_DELIVERY_FAILED',
    },
  };
}

function parseCsv(input: string): V1BatchJobInput[] {
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = lines[0]?.split(',').map((header) => header.trim()) ?? [];
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
    return {
      externalId: row.externalId || row.jobPostingId || `csv_${index + 1}`,
      company: { name: row.companyName || row.company || 'Unknown Company' },
      job: {
        title: row.title || 'Untitled Job',
        description: row.description || '',
        ...(row.location ? { location: row.location } : {}),
        ...(row.salary ? { salary: row.salary } : {}),
        ...(row.employmentType ? { employmentType: row.employmentType } : {}),
      },
      options: {
        jurisdiction: 'CN_MAINLAND',
        enableRag: row.enableRag === 'true',
        enableRewrite: row.enableRewrite === 'true',
      },
    };
  });
}

function parseJsonl(input: string): V1BatchJobInput[] {
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as V1BatchJobInput);
}

function batchResponse(batch: {
  id: string;
  status: string;
  totalCount: number;
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  resultIds: string[];
  errors: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}): StableBatchResponse {
  return {
    id: batch.id,
    object: 'batch_audit_job',
    status: batch.status,
    totalCount: batch.totalCount,
    queuedCount: batch.queuedCount,
    processingCount: batch.processingCount,
    completedCount: batch.completedCount,
    failedCount: batch.failedCount,
    resultIds: batch.resultIds,
    errors: batch.errors,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

async function persistAndNotify(
  input: {
    result: AuditResult;
    coreInput: JobPostingInput;
    request: AuditJobRequest;
    startedAt: number;
  },
  dependencies: IntegrationRoutesDependencies,
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

export function registerIntegrationRoutes(
  app: FastifyInstance,
  dependencies: IntegrationRoutesDependencies,
): void {
  const auditJob = dependencies.auditJob ?? defaultAuditJob;

  app.get('/v1/openapi.json', async (_request, reply) => reply.send(openApiDocument));

  app.post('/v1/audit/job', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const body = v1AuditJobSchema.parse(request.body);
    const tenantId = body.tenantId ?? auth.tenantId;
    if (tenantId !== auth.tenantId) {
      return reply.code(403).send(errorResponse(request.id, 'TENANT_MISMATCH', 'API key tenant mismatch.'));
    }
    dependencies.performanceServices.rateLimitService.assertAllowed({
      tenantId,
      quantity: 1,
      apiKeyId: auth.apiKeyId,
    });
    dependencies.productService.assertQuota(tenantId, 1);

    const auditRequest = auditJobRequestSchema.parse({
      tenantId,
      jobPostingId: body.externalId ?? `external_${request.id}`,
      company: body.company,
      job: body.job,
      options: body.options ?? {},
    });
    const startedAt = Date.now();
    const coreInput = toCoreInput(auditRequest);
    const runtime = dependencies.runtimeServices?.runtimeConfigService.resolveForTenant(tenantId);
    const result = await dependencies.performanceServices.fallbackPolicyService.runAuditWithFallback(
      () => auditJob(coreInput, auditRequest, runtime),
      () => defaultAuditJob(coreInput, auditRequest, runtime),
    );
    await persistAndNotify({ result, coreInput, request: auditRequest, startedAt }, dependencies);
    dependencies.performanceServices.rateLimitService.record({
      tenantId,
      quantity: 1,
      apiKeyId: auth.apiKeyId,
    });
    dependencies.productService.recordUsage({
      tenantId,
      quantity: 1,
      apiKeyId: auth.apiKeyId,
      metadata: { auditId: result.auditId, apiVersion: 'v1' },
    });
    dependencies.performanceServices.costTrackingService.recordAudit({
      tenantId,
      apiKeyId: auth.apiKeyId,
      auditId: result.auditId,
      ragNoResult: result.findings.length > 0 && result.evidence.length === 0,
    });
    if (body.sandbox || auth.environment === 'sandbox') {
      dependencies.integrationService.recordSandboxRun({
        tenantId,
        auditRunId: result.auditId,
        input: body as unknown as Record<string, unknown>,
        result,
      });
    }
    const stable = toStableAuditResponse(result);
    await dependencies.integrationService.dispatchWebhook({
      tenantId,
      event: 'audit.completed',
      payload: {
        id: `evt_${request.id}`,
        object: 'event',
        type: 'audit.completed',
        data: stable,
        createdAt: new Date().toISOString(),
      },
    });
    return reply.send(stable);
  });

  app.post('/v1/audit/batch', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const body = v1BatchAuditSchema.parse(request.body);
    const tenantId = body.tenantId ?? auth.tenantId;
    if (tenantId !== auth.tenantId) {
      return reply.code(403).send(errorResponse(request.id, 'TENANT_MISMATCH', 'API key tenant mismatch.'));
    }
    const jobs = body.jobs ?? (body.jsonl !== undefined ? parseJsonl(body.jsonl) : parseCsv(body.csv ?? ''));
    dependencies.performanceServices.rateLimitService.assertAllowed({
      tenantId,
      quantity: jobs.length,
      apiKeyId: auth.apiKeyId,
    });
    dependencies.productService.assertQuota(tenantId, jobs.length);
    dependencies.productService.recordUsage({
      tenantId,
      quantity: jobs.length,
      apiKeyId: auth.apiKeyId,
      metadata: { source: 'v1_batch' },
    });
    dependencies.performanceServices.rateLimitService.record({
      tenantId,
      quantity: jobs.length,
      apiKeyId: auth.apiKeyId,
    });

    const batch = dependencies.performanceServices.queueService.enqueueBatch({
      tenantId,
      jobs: jobs.map((job, index) => ({
        jobPostingId: job.externalId ?? `batch_${index + 1}`,
        request: auditJobRequestSchema.parse({
          tenantId,
          jobPostingId: job.externalId ?? `batch_${index + 1}`,
          company: job.company,
          job: job.job,
          options: job.options ?? {},
        }),
      })),
      processor: async (item) => {
        const startedAt = Date.now();
        const coreInput = toCoreInput(item.request);
        const runtime = dependencies.runtimeServices?.runtimeConfigService.resolveForTenant(tenantId);
        const result = await dependencies.performanceServices.fallbackPolicyService.runAuditWithFallback(
          () => auditJob(coreInput, item.request, runtime),
          () => defaultAuditJob(coreInput, item.request, runtime),
        );
        await persistAndNotify({ result, coreInput, request: item.request, startedAt }, dependencies);
        dependencies.performanceServices.costTrackingService.recordAudit({
          tenantId,
          apiKeyId: auth.apiKeyId,
          auditId: result.auditId,
          batchId: item.batchId,
          itemId: item.itemId,
          ragNoResult: result.findings.length > 0 && result.evidence.length === 0,
        });
        if (body.sandbox || auth.environment === 'sandbox') {
          dependencies.integrationService.recordSandboxRun({
            tenantId,
            auditRunId: result.auditId,
            input: item.request as unknown as Record<string, unknown>,
            result,
          });
        }
        return { auditRunId: result.auditId };
      },
      onBatchComplete: async (completedBatch) => {
        await dependencies.integrationService.dispatchWebhook({
          tenantId,
          event: 'batch.completed',
          payload: {
            id: `evt_batch_${completedBatch.id}`,
            object: 'event',
            type: 'batch.completed',
            data: batchResponse(completedBatch),
            createdAt: new Date().toISOString(),
          },
        });
      },
    });
    return reply.code(202).send(batchResponse(batch));
  });

  app.get('/v1/audit/runs/:id', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const params = v1ParamsSchema.parse(request.params);
    const result = await dependencies.auditRunStore.findById(params.id, auth.tenantId);
    if (result === undefined) {
      return reply.code(404).send(errorResponse(request.id, 'AUDIT_RUN_NOT_FOUND', 'Audit run not found.'));
    }
    return reply.send(toStableAuditResponse(result));
  });

  app.get('/v1/audit/batch/:id', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const params = v1ParamsSchema.parse(request.params);
    const batch = dependencies.performanceServices.queueService.getBatch(params.id);
    if (batch === undefined || batch.tenantId !== auth.tenantId) {
      return reply.code(404).send(errorResponse(request.id, 'BATCH_NOT_FOUND', 'Batch audit job not found.'));
    }
    return reply.send(batchResponse(batch));
  });

  app.post('/v1/webhooks/test', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const body = v1WebhookTestSchema.parse(request.body);
    const result = await dependencies.integrationService.testWebhook({
      tenantId: auth.tenantId,
      ...(body.url === undefined ? {} : { url: body.url }),
      event: body.event,
      ...(body.secret === undefined ? {} : { secret: body.secret }),
    });
    return reply.send(result);
  });

  app.post('/v1/webhooks', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const body = v1WebhookEndpointSchema.parse(request.body);
    const endpoint = dependencies.integrationService.createWebhookEndpoint({
      tenantId: auth.tenantId,
      url: body.url,
      events: body.events,
      ...(body.secret === undefined ? {} : { secret: body.secret }),
    });
    return reply.code(201).send({
      id: endpoint.id,
      object: 'webhook_endpoint',
      url: endpoint.url,
      events: endpoint.events,
      status: endpoint.status,
      signingSecret: endpoint.secret,
      createdAt: endpoint.createdAt,
    });
  });

  app.get('/v1/webhooks/deliveries', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    return reply.send({
      object: 'list',
      items: dependencies.integrationService.listDeliveryLogs(auth.tenantId),
    });
  });

  app.get('/v1/usage', async (request, reply) => {
    const auth = dependencies.integrationService.authenticate(request.headers as Record<string, unknown>);
    const query = v1UsageQuerySchema.parse(request.query);
    const tenantId = query.tenantId ?? auth.tenantId;
    if (tenantId !== auth.tenantId) {
      return reply.code(403).send(errorResponse(request.id, 'TENANT_MISMATCH', 'API key tenant mismatch.'));
    }
    return reply.send({
      object: 'usage',
      quota: dependencies.productService.getUsage(tenantId),
      limits: dependencies.performanceServices.rateLimitService.snapshot(tenantId, auth.apiKeyId),
      costs: dependencies.performanceServices.costTrackingService.getUsage({ tenantId }),
    });
  });
}

export function integrationErrorPayload(
  requestId: string,
  error: IntegrationApiError,
): Record<string, unknown> {
  return errorResponse(requestId, error.code, error.message);
}
