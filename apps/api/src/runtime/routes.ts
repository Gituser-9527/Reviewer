import type { FastifyInstance } from 'fastify';
import {
  createRolloutSchema,
  rolloutParamsSchema,
  runtimeConfigParamsSchema,
  updateRolloutSchema,
  updateRuntimeConfigSchema,
} from './schemas.js';
import type { AuthServices } from '../auth/service.js';
import type { RuntimeServices } from './services.js';

export function registerRuntimeRoutes(
  app: FastifyInstance,
  services: RuntimeServices,
  authServices?: AuthServices,
): void {
  app.get('/api/runtime-configs', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    return reply.send({ items: services.runtimeConfigService.listConfigs() });
  });

  app.patch('/api/runtime-configs/:key', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const params = runtimeConfigParamsSchema.parse(request.params);
    const body = updateRuntimeConfigSchema.parse(request.body);
    const before = services.runtimeConfigService
      .listConfigs()
      .find((config) => config.key === params.key);
    const updated = services.runtimeConfigService.updateConfig(params.key, {
      ...(body.stableVersion === undefined ? {} : { stableVersion: body.stableVersion }),
      ...(body.candidateVersion === undefined ? {} : { candidateVersion: body.candidateVersion }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.updatedBy === undefined ? {} : { updatedBy: body.updatedBy }),
    });
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'runtime_config_update',
        resourceType: 'runtime_config',
        resourceId: params.key,
        ...(before === undefined ? {} : { before: before as unknown as Record<string, unknown> }),
        after: updated as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(updated);
  });

  app.get('/api/rollouts', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    return reply.send({ items: services.rolloutService.listRollouts() });
  });

  app.post('/api/rollouts', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const body = createRolloutSchema.parse(request.body);
    const created = services.rolloutService.createRollout({
      target: body.target,
      stableVersion: body.stableVersion,
      candidateVersion: body.candidateVersion,
      tenantAllowList: body.tenantAllowList,
      rolloutPercent: body.rolloutPercent,
      ...(body.createdBy === undefined ? {} : { createdBy: body.createdBy }),
      ...(body.description === undefined ? {} : { description: body.description }),
    });
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'rollout_create',
        resourceType: 'rollout_plan',
        resourceId: created.id,
        after: created as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(created);
  });

  app.patch('/api/rollouts/:id', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const params = rolloutParamsSchema.parse(request.params);
    const body = updateRolloutSchema.parse(request.body);
    const before = services.rolloutService
      .listRollouts()
      .find((rollout) => rollout.id === params.id);
    const updated = services.rolloutService.updateRollout(params.id, {
      ...(body.tenantAllowList === undefined ? {} : { tenantAllowList: body.tenantAllowList }),
      ...(body.rolloutPercent === undefined ? {} : { rolloutPercent: body.rolloutPercent }),
      ...(body.status === undefined ? {} : { status: body.status }),
      ...(body.description === undefined ? {} : { description: body.description }),
    });
    if (updated === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'ROLLOUT_NOT_FOUND',
          message: 'Rollout plan was not found.',
          retryable: false,
        },
      });
    }
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: body.rolloutPercent === undefined ? 'rollout_update' : 'rollout_percent_update',
        resourceType: 'rollout_plan',
        resourceId: params.id,
        ...(before === undefined ? {} : { before: before as unknown as Record<string, unknown> }),
        after: updated as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(updated);
  });

  app.post('/api/rollouts/:id/rollback', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const params = rolloutParamsSchema.parse(request.params);
    const before = services.rolloutService
      .listRollouts()
      .find((rollout) => rollout.id === params.id);
    const updated = services.rolloutService.rollbackRollout(params.id);
    if (updated === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'ROLLOUT_NOT_FOUND',
          message: 'Rollout plan was not found.',
          retryable: false,
        },
      });
    }
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'rollout_rollback',
        resourceType: 'rollout_plan',
        resourceId: params.id,
        ...(before === undefined ? {} : { before: before as unknown as Record<string, unknown> }),
        after: updated as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(updated);
  });

  app.get('/api/metrics/audit', async (_request, reply) => {
    return reply.send(services.metricsService.getAuditMetrics());
  });

  app.get('/api/alerts', async (_request, reply) => {
    return reply.send({ items: services.alertService.listAlerts() });
  });
}
