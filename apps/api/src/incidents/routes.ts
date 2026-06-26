import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import {
  createIncidentActionSchema,
  createIncidentSchema,
  createPostmortemSchema,
  emergencySwitchParamsSchema,
  incidentListQuerySchema,
  incidentParamsSchema,
  ruleRollbackDrillSchema,
  updateEmergencySwitchSchema,
} from './schemas.js';
import type { IncidentResponseService } from './service.js';

export interface IncidentRoutesDependencies {
  service: IncidentResponseService;
  authServices?: AuthServices;
}

function notFound(requestId: string, code: string, message: string) {
  return {
    requestId,
    error: {
      code,
      message,
      retryable: false,
    },
  };
}

export function registerIncidentRoutes(
  app: FastifyInstance,
  dependencies: IncidentRoutesDependencies,
): void {
  const service = dependencies.service;

  app.get('/api/emergency/switches', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'runtime:read');
    return reply.send({ items: service.listSwitches() });
  });

  app.patch('/api/emergency/switches/:key', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const params = emergencySwitchParamsSchema.parse(request.params);
    const body = updateEmergencySwitchSchema.parse(request.body);
    const before = service.getSwitch(params.key);
    const updated = service.updateSwitch({
      key: params.key,
      enabled: body.enabled,
      ...(body.reason === undefined ? {} : { reason: body.reason }),
      updatedBy: body.updatedBy,
    });
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'emergency_switch_update',
        resourceType: 'emergency_runtime_switch',
        resourceId: params.key,
        before: before as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(updated);
  });

  app.post('/api/emergency/switches/:key/trigger', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const params = emergencySwitchParamsSchema.parse(request.params);
    const body = updateEmergencySwitchSchema.parse(request.body);
    const updated = service.updateSwitch({
      key: params.key,
      enabled: true,
      ...(body.reason === undefined ? {} : { reason: body.reason }),
      updatedBy: body.updatedBy,
    });
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'emergency_switch_trigger',
        resourceType: 'emergency_runtime_switch',
        resourceId: params.key,
        after: updated as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(updated);
  });

  app.get('/api/incidents', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'runtime:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = incidentListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    return reply.send({
      items: service.listIncidents({
        ...(tenantId === undefined ? {} : { tenantId }),
        status: query.status,
      }),
    });
  });

  app.post('/api/incidents', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const body = createIncidentSchema.parse(request.body);
    if (body.tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    }
    const incident = service.createIncident({
      ...(body.tenantId === undefined ? {} : { tenantId: body.tenantId }),
      incidentType: body.incidentType,
      severity: body.severity,
      title: body.title,
      description: body.description,
      ...(body.relatedAuditRunId === undefined ? {} : { relatedAuditRunId: body.relatedAuditRunId }),
      createdBy: body.createdBy,
    });
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'incident_create',
        resourceType: 'incident_event',
        resourceId: incident.id,
        ...(incident.tenantId === undefined ? {} : { tenantId: incident.tenantId }),
        after: incident as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(incident);
  });

  app.get('/api/incidents/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'runtime:read');
    const params = incidentParamsSchema.parse(request.params);
    const incident = service.findIncident(params.id);
    if (incident === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'INCIDENT_NOT_FOUND', 'Incident was not found.'));
    }
    if (incident.tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, incident.tenantId);
    }
    return reply.send({
      incident,
      actions: service.listActions(incident.id),
      postmortem: service.findPostmortem(incident.id),
    });
  });

  app.post('/api/incidents/:id/actions', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const params = incidentParamsSchema.parse(request.params);
    const body = createIncidentActionSchema.parse(request.body);
    const action = service.recordAction({
      incidentId: params.id,
      actionType: body.actionType,
      actorId: body.actorId,
      summary: body.summary,
    });
    if (action === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'INCIDENT_NOT_FOUND', 'Incident was not found.'));
    }
    return reply.code(201).send(action);
  });

  app.post('/api/incidents/:id/postmortem', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const params = incidentParamsSchema.parse(request.params);
    const body = createPostmortemSchema.parse(request.body);
    const postmortem = service.createPostmortem(params.id, {
      rootCause: body.rootCause,
      impact: body.impact,
      timeline: body.timeline,
      correctiveActions: body.correctiveActions,
      preventionActions: body.preventionActions,
      createdBy: body.createdBy,
    });
    if (postmortem === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'INCIDENT_NOT_FOUND', 'Incident was not found.'));
    }
    return reply.code(201).send(postmortem);
  });

  app.post('/api/incidents/drills/rule-rollback', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const body = ruleRollbackDrillSchema.parse(request.body);
    return reply.code(201).send(
      service.runRuleRollbackDrill({
        actorId: body.actorId,
        ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
      }),
    );
  });
}
