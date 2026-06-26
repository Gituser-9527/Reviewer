import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthServices } from './service.js';

const auditLogQuerySchema = z
  .object({
    tenantId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export function registerAuthRoutes(app: FastifyInstance, services: AuthServices): void {
  app.get('/api/auth/me', async (request, reply) => {
    return reply.send(services.authService.currentUserPayload(request));
  });

  app.get('/api/audit-operation-logs', async (request, reply) => {
    const context = services.authService.requirePermission(request, 'audit_log:read');
    services.authService.requireTenantScope(request);
    const query = auditLogQuerySchema.parse(request.query);
    if (query.tenantId !== undefined) {
      services.authService.requireTenantAccess(request, query.tenantId);
    }
    const items = services.auditLogService.list({
      ...(context.role === 'SUPER_ADMIN'
        ? query.tenantId === undefined
          ? {}
          : { tenantId: query.tenantId }
        : { tenantId: context.tenantId }),
    });
    return reply.send({ items });
  });

  app.get('/api/rule-publish-approvals', async (request, reply) => {
    services.authService.requirePermission(request, 'rule:read');
    return reply.send({ items: services.rulePublishApprovalService.list() });
  });
}
