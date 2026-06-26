import type { FastifyInstance } from 'fastify';
import type { AuditRunStore } from '../audit/store.js';
import type { AuthServices } from '../auth/service.js';
import {
  configureRetentionSchema,
  createDeletionRequestSchema,
  createPrivacyExportRequestSchema,
  deletionRequestParamsSchema,
  tenantQuerySchema,
} from './schemas.js';
import type { LaunchSecurityComplianceService } from './service.js';

export interface LaunchSecurityRoutesDependencies {
  service: LaunchSecurityComplianceService;
  auditRunStore: AuditRunStore;
  authServices?: AuthServices;
}

export function registerLaunchSecurityRoutes(
  app: FastifyInstance,
  dependencies: LaunchSecurityRoutesDependencies,
): void {
  const { service, authServices, auditRunStore } = dependencies;

  app.get('/api/security/launch-check/report', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const report = service.generateSecurityReport({ auditRunStore });
    return reply.send(report);
  });

  app.get('/api/security/check-results', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    return reply.send({ items: service.listSecurityCheckResults() });
  });

  app.get('/api/security/data-retention/jobs', async (request, reply) => {
    const context = authServices?.authService.requirePermission(request, 'global:manage');
    const query = tenantQuerySchema.parse(request.query);
    if (query.tenantId !== undefined) {
      authServices?.authService.requireTenantAccess(request, query.tenantId);
    }
    const listOptions =
      context?.role === 'SUPER_ADMIN'
        ? query.tenantId === undefined
          ? {}
          : { tenantId: query.tenantId }
        : context?.tenantId === undefined
          ? {}
          : { tenantId: context.tenantId };
    return reply.send({
      items: service.listRetentionJobs(listOptions),
    });
  });

  app.post('/api/security/data-retention/jobs', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const body = configureRetentionSchema.parse(request.body);
    if (body.tenantId !== undefined) {
      authServices?.authService.requireTenantAccess(request, body.tenantId);
    }
    const created = service.configureRetention(body);
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'data_retention_configure',
        resourceType: 'data_retention_job',
        resourceId: created.id,
        ...(created.tenantId === undefined ? {} : { tenantId: created.tenantId }),
        after: created as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(created);
  });

  app.get('/api/security/data-deletion-requests', async (request, reply) => {
    const context = authServices?.authService.requirePermission(request, 'global:manage');
    const query = tenantQuerySchema.parse(request.query);
    if (query.tenantId !== undefined) {
      authServices?.authService.requireTenantAccess(request, query.tenantId);
    }
    const listOptions =
      context?.role === 'SUPER_ADMIN'
        ? query.tenantId === undefined
          ? {}
          : { tenantId: query.tenantId }
        : context?.tenantId === undefined
          ? {}
          : { tenantId: context.tenantId };
    return reply.send({
      items: service.listDeletionRequests(listOptions),
    });
  });

  app.post('/api/security/data-deletion-requests', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const body = createDeletionRequestSchema.parse(request.body);
    authServices?.authService.requireTenantAccess(request, body.tenantId);
    const created = service.createDeletionRequest(body, actor?.userId ?? 'dev_super_admin');
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'data_deletion_request_create',
        resourceType: 'data_deletion_request',
        resourceId: created.id,
        tenantId: created.tenantId,
        after: created as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(created);
  });

  app.post('/api/security/data-deletion-requests/:id/execute', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'global:manage');
    const params = deletionRequestParamsSchema.parse(request.params);
    const updated = await service.executeDeletion(params.id, { auditRunStore });
    authServices?.authService.requireTenantAccess(request, updated.tenantId);
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'data_deletion_execute',
        resourceType: 'data_deletion_request',
        resourceId: updated.id,
        tenantId: updated.tenantId,
        after: updated as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(updated);
  });

  app.get('/api/security/privacy-export-requests', async (request, reply) => {
    const context = authServices?.authService.requirePermission(request, 'audit_log:read');
    authServices?.authService.requireTenantScope(request);
    const query = tenantQuerySchema.parse(request.query);
    if (query.tenantId !== undefined) {
      authServices?.authService.requireTenantAccess(request, query.tenantId);
    }
    const listOptions =
      context?.role === 'SUPER_ADMIN'
        ? query.tenantId === undefined
          ? {}
          : { tenantId: query.tenantId }
        : context?.tenantId === undefined
          ? {}
          : { tenantId: context.tenantId };
    return reply.send({
      items: service.listPrivacyExportRequests(listOptions),
    });
  });

  app.post('/api/security/privacy-export-requests', async (request, reply) => {
    const actor = authServices?.authService.requirePermission(request, 'audit_log:read');
    const body = createPrivacyExportRequestSchema.parse(request.body);
    authServices?.authService.requireTenantAccess(request, body.tenantId);
    const created = service.createPrivacyExport(
      body,
      actor?.userId ?? 'dev_super_admin',
      authServices === undefined ? {} : { auditLogService: authServices.auditLogService },
    );
    if (actor !== undefined) {
      authServices?.auditLogService.record({
        actor,
        operation: 'privacy_export_create',
        resourceType: 'privacy_export_request',
        resourceId: created.id,
        tenantId: created.tenantId,
        after: created as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(created);
  });
}
