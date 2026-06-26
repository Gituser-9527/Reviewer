import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import {
  addBetaFeedbackSchema,
  addBetaParticipantSchema,
  betaCheckParamsSchema,
  betaFeedbackListQuerySchema,
  betaProgramListQuerySchema,
  betaProgramParamsSchema,
  createBetaDailyReportSchema,
  createBetaProgramSchema,
  updateBetaProgramModeSchema,
  updateGoNoGoCheckSchema,
} from './schemas.js';
import type { BetaProgramService } from './service.js';

export interface BetaProgramRoutesDependencies {
  service: BetaProgramService;
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

export function registerBetaProgramRoutes(
  app: FastifyInstance,
  dependencies: BetaProgramRoutesDependencies,
): void {
  const service = dependencies.service;

  app.get('/api/beta-programs', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = betaProgramListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    return reply.send({
      items: service.listPrograms({
        ...(tenantId === undefined ? {} : { tenantId }),
      }),
    });
  });

  app.post('/api/beta-programs', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const body = createBetaProgramSchema.parse(request.body);
    dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    const program = service.createProgram({
      tenantId: body.tenantId,
      name: body.name,
      mode: body.mode,
      startDate: body.startDate,
      endDate: body.endDate,
      ...(body.scope === undefined ? {} : { scope: body.scope }),
      goals: body.goals,
      ownerId: body.ownerId ?? actor?.userId ?? 'beta_owner',
    });
    return reply.code(201).send(program);
  });

  app.get('/api/beta-programs/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const overview = service.getOverview(params.id);
    if (overview === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, overview.program.tenantId);
    return reply.send(overview);
  });

  app.patch('/api/beta-programs/:id/mode', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const body = updateBetaProgramModeSchema.parse(request.body);
    const before = service.findProgram(params.id);
    if (before !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, before.tenantId);
    }
    const updated = service.setMode(params.id, body.mode);
    if (updated === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    return reply.send(updated);
  });

  app.post('/api/beta-programs/:id/participants', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const body = addBetaParticipantSchema.parse(request.body);
    const program = service.findProgram(params.id);
    if (program === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, program.tenantId);
    const participant = service.addParticipant(params.id, {
      userId: body.userId,
      displayName: body.displayName,
      role: body.role,
      ...(body.email === undefined ? {} : { email: body.email }),
    });
    return reply.code(201).send(participant);
  });

  app.post('/api/beta-programs/:id/feedback', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const body = addBetaFeedbackSchema.parse(request.body);
    const program = service.findProgram(params.id);
    if (program === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, program.tenantId);
    const feedback = service.addFeedback(params.id, {
      reporterId: body.reporterId,
      feedbackType: body.feedbackType,
      severity: body.severity,
      title: body.title,
      description: body.description,
      ...(body.relatedAuditRunId === undefined ? {} : { relatedAuditRunId: body.relatedAuditRunId }),
    });
    return reply.code(201).send(feedback);
  });

  app.get('/api/beta-feedback', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = betaFeedbackListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    return reply.send({
      items: service.listFeedback({
        ...(tenantId === undefined ? {} : { tenantId }),
        ...(query.programId === undefined ? {} : { programId: query.programId }),
        status: query.status,
      }),
    });
  });

  app.post('/api/beta-programs/:id/daily-reports', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const body = createBetaDailyReportSchema.parse(request.body);
    const program = service.findProgram(params.id);
    if (program === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, program.tenantId);
    const report = service.createDailyReport(params.id, {
      ...(body.reportDate === undefined ? {} : { reportDate: body.reportDate }),
      auditsReviewed: body.auditsReviewed,
      manualReviewsCompleted: body.manualReviewsCompleted,
      blockers: body.blockers,
      ...(body.summary === undefined ? {} : { summary: body.summary }),
      nextActions: body.nextActions,
      createdBy: body.createdBy ?? 'beta_operator',
    });
    return reply.code(201).send(report);
  });

  app.get('/api/beta-programs/:id/daily-reports', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const program = service.findProgram(params.id);
    if (program === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, program.tenantId);
    return reply.send({ items: service.listDailyReports(params.id) });
  });

  app.get('/api/beta-programs/:id/go-no-go', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaProgramParamsSchema.parse(request.params);
    const overview = service.getOverview(params.id);
    if (overview === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, overview.program.tenantId);
    return reply.send({
      items: overview.goNoGoChecks,
      summary: overview.goNoGoSummary,
    });
  });

  app.patch('/api/beta-programs/:id/go-no-go/:checkId', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = betaCheckParamsSchema.parse(request.params);
    const body = updateGoNoGoCheckSchema.parse(request.body);
    const program = service.findProgram(params.id);
    if (program === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_PROGRAM_NOT_FOUND', 'Beta program was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, program.tenantId);
    const check = service.updateGoNoGoCheck(params.id, params.checkId, {
      status: body.status,
      ...(body.evidence === undefined ? {} : { evidence: body.evidence }),
    });
    if (check === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'BETA_CHECK_NOT_FOUND', 'Beta Go/No-Go check was not found.'));
    }
    return reply.send(check);
  });
}
