import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import type { QaInspectionService } from './service.js';
import {
  createQaInspectionJobSchema,
  qaIssueListQuerySchema,
  qaIssueParamsSchema,
  qaJobListQuerySchema,
  qaJobParamsSchema,
  resolveQaIssueSchema,
} from './schemas.js';

export interface QaRoutesDependencies {
  service: QaInspectionService;
  authServices?: AuthServices;
}

export function registerQaRoutes(app: FastifyInstance, dependencies: QaRoutesDependencies): void {
  app.post('/api/qa/inspection-jobs', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const body = createQaInspectionJobSchema.parse(request.body);
    dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    const job = await dependencies.service.createJob({
      tenantId: body.tenantId,
      strategy: body.strategy,
      sampleSize: body.sampleSize,
      includeAppeals: body.includeAppeals,
      includeRewrites: body.includeRewrites,
      includeEvidence: body.includeEvidence,
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
      ...(body.reviewerId === undefined ? {} : { reviewerId: body.reviewerId }),
      createdBy: body.createdBy ?? actor?.userId ?? 'qa_agent',
    });
    return reply.code(201).send(job);
  });

  app.get('/api/qa/inspection-jobs', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = qaJobListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    const items = dependencies.service.listJobs({
      ...(tenantId === undefined ? {} : { tenantId }),
    });
    return reply.send({ items });
  });

  app.get('/api/qa/inspection-jobs/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = qaJobParamsSchema.parse(request.params);
    const job = dependencies.service.getJob(params.id);
    if (job === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'QA_INSPECTION_JOB_NOT_FOUND',
          message: 'QA inspection job was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, job.tenantId);
    return reply.send(job);
  });

  app.get('/api/qa/issues', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = qaIssueListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    const items = dependencies.service.listIssues({
      status: query.status,
      ...(tenantId === undefined ? {} : { tenantId }),
    });
    return reply.send({ items });
  });

  app.post('/api/qa/issues/:id/resolve', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = qaIssueParamsSchema.parse(request.params);
    const body = resolveQaIssueSchema.parse(request.body);
    const before = dependencies.service
      .listIssues({ status: 'all' })
      .find((issue) => issue.id === params.id);
    if (before !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, before.tenantId);
    }
    const issue = await dependencies.service.resolveIssue(params.id, {
      resolvedBy: body.resolvedBy,
      addToEval: body.addToEval,
      createRuleSuggestion: body.createRuleSuggestion,
      datasetId: body.datasetId,
      ...(body.resolutionComment === undefined
        ? {}
        : { resolutionComment: body.resolutionComment }),
    });
    if (issue === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'QA_ISSUE_NOT_FOUND',
          message: 'QA quality issue was not found.',
          retryable: false,
        },
      });
    }
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'qa_quality_issue_resolved',
        resourceType: 'qa_quality_issue',
        resourceId: issue.id,
        tenantId: issue.tenantId,
        ...(before === undefined ? {} : { before: before as unknown as Record<string, unknown> }),
        after: issue as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(issue);
  });
}
