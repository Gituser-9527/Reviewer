import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import { approveBetaFromUatSchema, generateUatReportSchema, uatReportParamsSchema } from './schemas.js';
import { UatApprovalError, type UatAcceptanceService, type UatMetricSnapshot } from './service.js';

export interface UatRoutesDependencies {
  service: UatAcceptanceService;
  authServices?: AuthServices;
}

function errorPayload(requestId: string, code: string, message: string) {
  return {
    requestId,
    error: {
      code,
      message,
      retryable: false,
    },
  };
}

function compactChecks(body: ReturnType<typeof generateUatReportSchema.parse>['checks']) {
  return body.map((check) => ({
    key: check.key,
    ...(check.title === undefined ? {} : { title: check.title }),
    ...(check.status === undefined ? {} : { status: check.status }),
    ...(check.required === undefined ? {} : { required: check.required }),
    ...(check.detail === undefined ? {} : { detail: check.detail }),
    ...(check.evidence === undefined ? {} : { evidence: check.evidence }),
  }));
}

function compactMetrics(
  metrics: ReturnType<typeof generateUatReportSchema.parse>['metrics'],
): UatMetricSnapshot | undefined {
  if (metrics === undefined) return undefined;
  return {
    ...(metrics.evalAccuracy === undefined ? {} : { evalAccuracy: metrics.evalAccuracy }),
    ...(metrics.decisionAccuracy === undefined ? {} : { decisionAccuracy: metrics.decisionAccuracy }),
    ...(metrics.categoryRecall === undefined ? {} : { categoryRecall: metrics.categoryRecall }),
    ...(metrics.redTeamRecall === undefined ? {} : { redTeamRecall: metrics.redTeamRecall }),
    ...(metrics.p95LatencyMs === undefined ? {} : { p95LatencyMs: metrics.p95LatencyMs }),
    ...(metrics.securityStatus === undefined ? {} : { securityStatus: metrics.securityStatus }),
    ...(metrics.privacyStatus === undefined ? {} : { privacyStatus: metrics.privacyStatus }),
    ...(metrics.rollbackDrillStatus === undefined
      ? {}
      : { rollbackDrillStatus: metrics.rollbackDrillStatus }),
    ...(metrics.trainingReadinessRate === undefined
      ? {}
      : { trainingReadinessRate: metrics.trainingReadinessRate }),
  };
}

export function registerUatRoutes(app: FastifyInstance, dependencies: UatRoutesDependencies): void {
  const service = dependencies.service;

  app.get('/api/uat/reports', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    return reply.send({ items: service.listReports() });
  });

  app.post('/api/uat/reports', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const body = generateUatReportSchema.parse(request.body);
    const metrics = compactMetrics(body.metrics);
    const report = service.generateReport({
      ...(body.currentVersion === undefined ? {} : { currentVersion: body.currentVersion }),
      generatedBy: body.generatedBy ?? actor?.userId ?? 'uat_operator',
      checks: compactChecks(body.checks),
      ...(metrics === undefined ? {} : { metrics }),
      ...(body.knownLimitations === undefined ? {} : { knownLimitations: body.knownLimitations }),
    });
    return reply.code(201).send(report);
  });

  app.get('/api/uat/reports/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = uatReportParamsSchema.parse(request.params);
    const report = service.findReport(params.id);
    if (report === undefined) {
      return reply
        .code(404)
        .send(errorPayload(request.id, 'UAT_REPORT_NOT_FOUND', 'UAT report was not found.'));
    }
    return reply.send(report);
  });

  app.post('/api/uat/reports/:id/approve-beta', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const params = uatReportParamsSchema.parse(request.params);
    const body = approveBetaFromUatSchema.parse(request.body);
    try {
      const result = service.approveBeta(params.id, {
        tenantId: body.tenantId,
        ...(body.name === undefined ? {} : { name: body.name }),
        mode: body.mode,
        startDate: body.startDate,
        endDate: body.endDate,
        ownerId: body.ownerId ?? actor?.userId ?? 'uat_approver',
      });
      if (actor !== undefined) {
        dependencies.authServices?.auditLogService.record({
          actor,
          operation: 'uat_approve_beta',
          resourceType: 'uat_acceptance_report',
          resourceId: params.id,
          tenantId: body.tenantId,
          after: {
            betaProgramId: result.betaProgram.id,
            goNoGoDecision: result.report.goNoGoDecision,
          },
          requestId: request.id,
        });
      }
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof UatApprovalError) {
        const statusCode = error.code === 'UAT_REPORT_NOT_FOUND' ? 404 : 409;
        return reply.code(statusCode).send(errorPayload(request.id, error.code, error.message));
      }
      throw error;
    }
  });
}
