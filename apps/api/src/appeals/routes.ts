import { redactSensitiveText } from '@job-compliance/database';
import type { FastifyInstance } from 'fastify';
import type { AuditRunStore } from '../audit/store.js';
import type { AuthServices } from '../auth/service.js';
import type { EvalStore } from '../evals/store.js';
import {
  addAppealMessageSchema,
  addAppealToEvalSchema,
  appealListQuerySchema,
  appealParamsSchema,
  createAppealRuleSuggestionSchema,
  createAppealSchema,
  submitAppealReviewResultSchema,
} from './schemas.js';
import type { InMemoryAppealStore } from './store.js';

export interface AppealRoutesDependencies {
  auditRunStore: AuditRunStore;
  evalStore: EvalStore;
  appealStore: InMemoryAppealStore;
  authServices?: AuthServices;
}

function notFound(requestId: string, code: string, message: string): Record<string, unknown> {
  return {
    requestId,
    error: {
      code,
      message,
      retryable: false,
    },
  };
}

export function registerAppealRoutes(
  app: FastifyInstance,
  dependencies: AppealRoutesDependencies,
): void {
  app.post('/api/appeals', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const body = createAppealSchema.parse(request.body);
    dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    const auditResult = await dependencies.auditRunStore.findById(body.auditRunId, body.tenantId);
    if (auditResult === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'AUDIT_RUN_NOT_FOUND', 'Audit run was not found.'));
    }
    const appeal = dependencies.appealStore.createAppeal(body, auditResult);
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'appeal_create',
        resourceType: 'appeal_case',
        resourceId: appeal.id,
        tenantId: appeal.tenantId,
        after: appeal as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(appeal);
  });

  app.get('/api/appeals', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'review:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = appealListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    const items = dependencies.appealStore.list({
      status: query.status,
      ...(tenantId === undefined ? {} : { tenantId }),
    });
    return reply.send({ items });
  });

  app.get('/api/appeals/rule-suggestions', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'review:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = appealListQuerySchema.pick({ tenantId: true }).parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    return reply.send({
      items: dependencies.appealStore.listRuleSuggestions({
        ...(tenantId === undefined ? {} : { tenantId }),
      }),
    });
  });

  app.get('/api/appeals/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'review:read');
    const params = appealParamsSchema.parse(request.params);
    const appeal = dependencies.appealStore.findById(params.id);
    if (appeal === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, appeal.tenantId);
    return reply.send(appeal);
  });

  app.post('/api/appeals/:id/messages', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'audit:read');
    const params = appealParamsSchema.parse(request.params);
    const appeal = dependencies.appealStore.findById(params.id);
    if (appeal === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, appeal.tenantId);
    const body = addAppealMessageSchema.parse(request.body);
    const message = dependencies.appealStore.addMessage(params.id, body);
    if (message === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'appeal_message_add',
        resourceType: 'appeal_case',
        resourceId: params.id,
        tenantId: message.tenantId,
        after: message as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(message);
  });

  app.post('/api/appeals/:id/agent-report', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = appealParamsSchema.parse(request.params);
    const appeal = dependencies.appealStore.findById(params.id);
    if (appeal === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, appeal.tenantId);
    const report = dependencies.appealStore.generateAgentReport(params.id);
    if (report === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'appeal_agent_report_generate',
        resourceType: 'appeal_case',
        resourceId: params.id,
        tenantId: report.tenantId,
        after: report as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.code(201).send(report);
  });

  app.post('/api/appeals/:id/review-result', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = appealParamsSchema.parse(request.params);
    const before = dependencies.appealStore.findById(params.id);
    if (before === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, before.tenantId);
    const body = submitAppealReviewResultSchema.parse(request.body);
    const result = dependencies.appealStore.submitReviewResult(params.id, body);
    if (result === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'appeal_review_result_submit',
        resourceType: 'appeal_case',
        resourceId: params.id,
        tenantId: result.tenantId,
        before: before as unknown as Record<string, unknown>,
        after: result as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    return reply.send(result);
  });

  app.post('/api/appeals/:id/add-to-eval', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'eval:write');
    const params = appealParamsSchema.parse(request.params);
    const body = addAppealToEvalSchema.parse(request.body);
    const appeal = dependencies.appealStore.findById(params.id);
    if (appeal === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, appeal.tenantId);
    const evalCase = dependencies.appealStore.toEvalCase(params.id, body.datasetId, body.source);
    if (evalCase === undefined) {
      return reply.code(422).send({
        requestId: request.id,
        error: {
          code: 'APPEAL_NOT_RESOLVED',
          message: 'Appeal must have a human review result before entering eval.',
          retryable: false,
        },
      });
    }
    await dependencies.evalStore.createDataset({
      id: body.datasetId,
      name: 'Appeal Review Feedback',
      version: 'v1',
      description: 'Samples converted from appeal review results.',
    });
    const items = await dependencies.evalStore.addCases(body.datasetId, [evalCase]);
    return reply.code(201).send({ imported: 1, case: evalCase, items });
  });

  app.post('/api/appeals/:id/create-rule-suggestion', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = appealParamsSchema.parse(request.params);
    const body = createAppealRuleSuggestionSchema.parse(request.body);
    const appeal = dependencies.appealStore.findById(params.id);
    if (appeal === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    dependencies.authServices?.authService.requireTenantAccess(request, appeal.tenantId);
    const suggestion = dependencies.appealStore.createRuleSuggestion({
      appealCaseId: params.id,
      createdBy: body.createdBy,
      ...(body.title === undefined ? {} : { title: redactSensitiveText(body.title) }),
      ...(body.description === undefined ? {} : { description: redactSensitiveText(body.description) }),
    });
    if (suggestion === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'APPEAL_NOT_FOUND', 'Appeal case was not found.'));
    }
    return reply.code(201).send(suggestion);
  });
}
