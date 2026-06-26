import type { FastifyInstance } from 'fastify';
import {
  betaTrialReportQuerySchema,
  betaTrialRunListQuerySchema,
  betaTrialRunParamsSchema,
  recordHumanResultBodySchema,
  tenantModeParamsSchema,
  updateTenantModeBodySchema,
} from './schemas.js';
import type { BetaTrialService } from './service.js';

export interface BetaTrialRoutesDependencies {
  betaTrialService: BetaTrialService;
}

export function registerBetaTrialRoutes(
  app: FastifyInstance,
  dependencies: BetaTrialRoutesDependencies,
): void {
  const service = dependencies.betaTrialService;

  app.get('/api/beta-trial/tenant-modes', async (_request, reply) => {
    return reply.send({ items: service.listTenantModes() });
  });

  app.get('/api/beta-trial/tenant-modes/:tenantId', async (request, reply) => {
    const params = tenantModeParamsSchema.parse(request.params);
    return reply.send(service.getTenantMode(params.tenantId));
  });

  app.patch('/api/beta-trial/tenant-modes/:tenantId', async (request, reply) => {
    const params = tenantModeParamsSchema.parse(request.params);
    const body = updateTenantModeBodySchema.parse(request.body);
    const updated = service.setTenantMode({
      tenantId: params.tenantId,
      mode: body.mode,
      enabled: body.enabled,
      updatedBy: body.updatedBy,
    });
    return reply.send(updated);
  });

  app.get('/api/beta-trial/runs', async (request, reply) => {
    const query = betaTrialRunListQuerySchema.parse(request.query);
    const items = service.listRuns({
      ...(query.tenantId === undefined ? {} : { tenantId: query.tenantId }),
      ...(query.mode === undefined ? {} : { mode: query.mode }),
      ...(query.mismatchOnly === undefined ? {} : { mismatchOnly: query.mismatchOnly }),
    });
    return reply.send({ items });
  });

  app.get('/api/beta-trial/runs/:id', async (request, reply) => {
    const params = betaTrialRunParamsSchema.parse(request.params);
    const run = service.findRunById(params.id);
    if (run === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'BETA_TRIAL_RUN_NOT_FOUND',
          message: 'Beta trial run was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(run);
  });

  app.post('/api/beta-trial/runs/:id/human-result', async (request, reply) => {
    const params = betaTrialRunParamsSchema.parse(request.params);
    const body = recordHumanResultBodySchema.parse(request.body);
    const updated = service.recordHumanResult({
      trialRunId: params.id,
      ...(body.auditRunId === undefined ? {} : { auditRunId: body.auditRunId }),
      reviewerId: body.reviewerId,
      finalDecision: body.finalDecision,
      feedbackType: body.feedbackType,
      ...(body.comment === undefined ? {} : { comment: body.comment }),
    });
    if (updated === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'BETA_TRIAL_RUN_NOT_FOUND',
          message: 'Beta trial run was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(updated);
  });

  app.get('/api/beta-trial/reports/daily', async (request, reply) => {
    const query = betaTrialReportQuerySchema.parse(request.query);
    return reply.send(
      service.generateDailyReport({
        ...(query.tenantId === undefined ? {} : { tenantId: query.tenantId }),
        ...(query.date === undefined ? {} : { date: query.date }),
        ...(query.mode === undefined ? {} : { mode: query.mode }),
      }),
    );
  });

  app.get('/api/beta-trial/reports/shadow-comparison', async (request, reply) => {
    const query = betaTrialReportQuerySchema.parse(request.query);
    return reply.send(
      service.generateDailyReport({
        ...(query.tenantId === undefined ? {} : { tenantId: query.tenantId }),
        ...(query.date === undefined ? {} : { date: query.date }),
        mode: 'shadow_mode',
      }),
    );
  });
}
