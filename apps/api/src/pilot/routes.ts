import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import type { PilotRoiService } from './service.js';
import {
  addCustomerFeedbackSchema,
  createPilotProjectSchema,
  exportReportQuerySchema,
  feedbackListQuerySchema,
  pilotListQuerySchema,
  pilotParamsSchema,
} from './schemas.js';

export interface PilotRoutesDependencies {
  service: PilotRoiService;
  authServices?: AuthServices;
}

export function registerPilotRoutes(
  app: FastifyInstance,
  dependencies: PilotRoutesDependencies,
): void {
  const service = dependencies.service;

  app.get('/api/pilots/projects', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = pilotListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    return reply.send({
      items: service.listProjects({
        ...(tenantId === undefined ? {} : { tenantId }),
      }),
    });
  });

  app.post('/api/pilots/projects', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const body = createPilotProjectSchema.parse(request.body);
    dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    const project = service.createProject({
      tenantId: body.tenantId,
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      modes: body.modes,
      avgReviewTimeBefore: body.avgReviewTimeBefore,
      avgReviewTimeAfter: body.avgReviewTimeAfter,
      hourlyLaborCost: body.hourlyLaborCost,
      ...(body.description === undefined ? {} : { description: body.description }),
      createdBy: body.createdBy ?? actor?.userId ?? 'pilot_operator',
    });
    return reply.code(201).send(project);
  });

  app.get('/api/pilots/projects/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = pilotParamsSchema.parse(request.params);
    const project = service.findProject(params.id);
    if (project === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'PILOT_PROJECT_NOT_FOUND',
          message: 'Pilot project was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, project.tenantId);
    return reply.send(project);
  });

  app.get('/api/pilots/projects/:id/dashboard', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = pilotParamsSchema.parse(request.params);
    const dashboard = await service.getDashboard(params.id);
    if (dashboard === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'PILOT_PROJECT_NOT_FOUND',
          message: 'Pilot project was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, dashboard.project.tenantId);
    return reply.send(dashboard);
  });

  app.post('/api/pilots/projects/:id/roi-report', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = pilotParamsSchema.parse(request.params);
    const project = service.findProject(params.id);
    if (project === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'PILOT_PROJECT_NOT_FOUND',
          message: 'Pilot project was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, project.tenantId);
    const report = await service.generateReport(params.id);
    return reply.code(201).send(report);
  });

  app.get('/api/pilots/projects/:id/roi-report/export', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = pilotParamsSchema.parse(request.params);
    const query = exportReportQuerySchema.parse(request.query);
    const project = service.findProject(params.id);
    if (project === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'PILOT_PROJECT_NOT_FOUND',
          message: 'Pilot project was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, project.tenantId);
    const exported = await service.exportReport(params.id, query.format);
    return reply
      .header('content-type', exported.contentType)
      .header('content-disposition', `attachment; filename="${exported.fileName}"`)
      .send(exported.body);
  });

  app.get('/api/pilots/feedback', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = feedbackListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    return reply.send({
      items: service.listFeedback({
        ...(tenantId === undefined ? {} : { tenantId }),
        ...(query.pilotProjectId === undefined ? {} : { pilotProjectId: query.pilotProjectId }),
      }),
    });
  });

  app.post('/api/pilots/projects/:id/feedback', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = pilotParamsSchema.parse(request.params);
    const body = addCustomerFeedbackSchema.parse(request.body);
    const project = service.findProject(params.id);
    if (project === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'PILOT_PROJECT_NOT_FOUND',
          message: 'Pilot project was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, project.tenantId);
    const feedback = service.addFeedback(params.id, {
      feedbackType: body.feedbackType,
      ...(body.rating === undefined ? {} : { rating: body.rating }),
      ...(body.contactName === undefined ? {} : { contactName: body.contactName }),
      comment: body.comment,
    });
    return reply.code(201).send(feedback);
  });
}
