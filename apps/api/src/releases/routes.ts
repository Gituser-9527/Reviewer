import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import {
  approveReleaseCandidateBodySchema,
  createReleaseCandidateBodySchema,
  publishReleaseCandidateBodySchema,
  releaseCandidateParamsSchema,
} from './schemas.js';
import {
  ReleaseGateError,
  type ReleaseQualityMetrics,
  type ReleaseQualityGateService,
} from './service.js';

export interface ReleaseRoutesDependencies {
  service: ReleaseQualityGateService;
  authServices?: AuthServices;
}

function releaseErrorStatus(code: ReleaseGateError['code']): number {
  if (code === 'RELEASE_CANDIDATE_NOT_FOUND') return 404;
  if (code === 'RELEASE_GATE_FAILED' || code === 'RELEASE_APPROVAL_REQUIRED') return 422;
  if (code === 'FORCE_PUBLISH_FORBIDDEN') return 403;
  return 400;
}

function compactMetrics(
  input: Record<string, number | undefined> | undefined,
): ReleaseQualityMetrics | undefined {
  if (input === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as ReleaseQualityMetrics;
}

export function registerReleaseRoutes(
  app: FastifyInstance,
  dependencies: ReleaseRoutesDependencies,
): void {
  const auth = dependencies.authServices?.authService;

  app.get('/api/releases/candidates', async (request, reply) => {
    auth?.requirePermission(request, 'runtime:read');
    return reply.send({ items: dependencies.service.listCandidates() });
  });

  app.post('/api/releases/candidates', async (request, reply) => {
    const actor = auth?.requirePermission(request, 'rule:edit_draft');
    const body = createReleaseCandidateBodySchema.parse(request.body);
    const createdBy = body.createdBy ?? actor?.userId;
    const qualityMetrics = compactMetrics(body.qualityMetrics);
    const candidate = dependencies.service.createCandidate({
      name: body.name,
      target: body.target,
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
      ...(body.lawKbVersion === undefined ? {} : { lawKbVersion: body.lawKbVersion }),
      ...(body.modelVersion === undefined ? {} : { modelVersion: body.modelVersion }),
      ...(body.promptVersion === undefined ? {} : { promptVersion: body.promptVersion }),
      ...(body.evalDatasetId === undefined ? {} : { evalDatasetId: body.evalDatasetId }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(createdBy === undefined ? {} : { createdBy }),
      ...(qualityMetrics === undefined ? {} : { qualityMetrics }),
    });
    return reply.code(201).send(candidate);
  });

  app.post('/api/releases/candidates/:id/run-gates', async (request, reply) => {
    auth?.requirePermission(request, 'eval:write');
    const params = releaseCandidateParamsSchema.parse(request.params);
    try {
      const result = await dependencies.service.runGates(params.id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof ReleaseGateError) {
        return reply.code(releaseErrorStatus(error.code)).send({
          requestId: request.id,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.code === 'RELEASE_GATE_FAILED',
          },
        });
      }
      throw error;
    }
  });

  app.get('/api/releases/candidates/:id/gate-results', async (request, reply) => {
    auth?.requirePermission(request, 'eval:read');
    const params = releaseCandidateParamsSchema.parse(request.params);
    const candidate = dependencies.service.getCandidate(params.id);
    if (candidate === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'RELEASE_CANDIDATE_NOT_FOUND',
          message: 'Release candidate was not found.',
          retryable: false,
        },
      });
    }
    return reply.send({
      candidate,
      approvals: dependencies.service.getApprovals(params.id),
      items: dependencies.service.getGateResults(params.id),
    });
  });

  app.post('/api/releases/candidates/:id/approve', async (request, reply) => {
    const actor = auth?.requirePermission(request, 'rule:approve_publish');
    const params = releaseCandidateParamsSchema.parse(request.params);
    const body = approveReleaseCandidateBodySchema.parse(request.body);
    try {
      const approval = dependencies.service.approveCandidate(params.id, {
        approvedBy: body.approvedBy ?? actor?.userId ?? 'compliance_manager',
        ...(body.comment === undefined ? {} : { comment: body.comment }),
      });
      if (actor !== undefined) {
        dependencies.authServices?.auditLogService.record({
          actor,
          operation: 'release_candidate_approve',
          resourceType: 'release_candidate',
          resourceId: params.id,
          after: approval as unknown as Record<string, unknown>,
          requestId: request.id,
        });
      }
      return reply.send(approval);
    } catch (error) {
      if (error instanceof ReleaseGateError) {
        return reply.code(releaseErrorStatus(error.code)).send({
          requestId: request.id,
          error: {
            code: error.code,
            message: error.message,
            retryable: false,
          },
        });
      }
      throw error;
    }
  });

  app.post('/api/releases/candidates/:id/publish', async (request, reply) => {
    const actor = auth?.requirePermission(request, 'rule:approve_publish');
    const params = releaseCandidateParamsSchema.parse(request.params);
    const body = publishReleaseCandidateBodySchema.parse(request.body);
    try {
      const result = dependencies.service.publishCandidate(params.id, {
        actor:
          actor ??
          ({
            userId: 'dev_super_admin',
            role: 'SUPER_ADMIN',
            permissions: [],
          } as const),
        forcePublish: body.forcePublish,
      });
      if (actor !== undefined) {
        dependencies.authServices?.auditLogService.record({
          actor,
          operation: body.forcePublish ? 'release_force_publish' : 'release_publish',
          resourceType: 'release_candidate',
          resourceId: params.id,
          after: result as unknown as Record<string, unknown>,
          requestId: request.id,
        });
      }
      return reply.send(result);
    } catch (error) {
      if (error instanceof ReleaseGateError) {
        return reply.code(releaseErrorStatus(error.code)).send({
          requestId: request.id,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.code === 'RELEASE_GATE_FAILED',
          },
        });
      }
      throw error;
    }
  });
}
