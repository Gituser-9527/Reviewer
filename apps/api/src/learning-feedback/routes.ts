import type { FastifyInstance } from 'fastify';
import type { HumanReviewStore } from '../reviews/store.js';
import type { AuthServices } from '../auth/service.js';
import type { LearningFeedbackService } from './service.js';
import { learningFeedbackListQuerySchema, learningFeedbackParamsSchema, learningFeedbackPreviewBodySchema, learningFeedbackReviewBodySchema, learningFeedbackSubmitBodySchema } from './schemas.js';

export function registerLearningFeedbackRoutes(app: FastifyInstance, dependencies: { reviewStore: HumanReviewStore; service: LearningFeedbackService; authServices: AuthServices }): void {
  app.post('/api/reviews/:id/learning-feedback/preview', async (request, reply) => {
    const actor = dependencies.authServices.authService.requirePermission(request, 'learning-feedback:write');
    const params = learningFeedbackParamsSchema.parse(request.params); const body = learningFeedbackPreviewBodySchema.parse(request.body);
    if (actor.tenantId === undefined) return reply.code(400).send({ requestId: request.id, error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Tenant scope is required.', retryable: false } });
    const ticket = await dependencies.reviewStore.findByIdForTenant(params.id, actor.tenantId);
    if (ticket === undefined) return reply.code(404).send({ requestId: request.id, error: { code: 'REVIEW_NOT_FOUND', message: 'Review ticket was not found.', retryable: false } });
    if (ticket.feedback?.reviewerId !== actor.userId) return reply.code(403).send({ requestId: request.id, error: { code: 'FORBIDDEN', message: 'Only the reviewing user may submit feedback.', retryable: false } });
    return reply.send(dependencies.service.preview(ticket, body));
  });
  app.post('/api/reviews/:id/learning-feedback', async (request, reply) => {
    const actor = dependencies.authServices.authService.requirePermission(request, 'learning-feedback:write');
    const params = learningFeedbackParamsSchema.parse(request.params); const body = learningFeedbackSubmitBodySchema.parse(request.body);
    if (actor.tenantId === undefined) return reply.code(400).send({ requestId: request.id, error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Tenant scope is required.', retryable: false } });
    const ticket = await dependencies.reviewStore.findByIdForTenant(params.id, actor.tenantId);
    if (ticket === undefined) return reply.code(404).send({ requestId: request.id, error: { code: 'REVIEW_NOT_FOUND', message: 'Review ticket was not found.', retryable: false } });
    if (ticket.feedback?.reviewerId !== actor.userId) return reply.code(403).send({ requestId: request.id, error: { code: 'FORBIDDEN', message: 'Only the reviewing user may submit feedback.', retryable: false } });
    const record = await dependencies.service.submit(ticket, actor.userId, body, request.id);
    dependencies.authServices.auditLogService.record({ actor, operation: 'learning_feedback_submitted', resourceType: 'learning_feedback', resourceId: record.id, tenantId: ticket.tenantId, after: { status: record.status }, requestId: request.id });
    return reply.code(201).send(record);
  });
  app.get('/api/learning-feedback', async (request, reply) => {
    const actor = dependencies.authServices.authService.requirePermission(request, 'learning-feedback:read');
    dependencies.authServices.authService.requireTenantScope(request); const query = learningFeedbackListQuerySchema.parse(request.query);
    if (actor.tenantId === undefined) return reply.code(400).send({ requestId: request.id, error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Tenant scope is required.', retryable: false } });
    return reply.send({ items: await dependencies.service.list(actor.tenantId, query.status) });
  });
  app.get('/api/learning-feedback/:id', async (request, reply) => {
    const actor = dependencies.authServices.authService.requirePermission(request, 'learning-feedback:read'); const params = learningFeedbackParamsSchema.parse(request.params);
    if (actor.tenantId === undefined) return reply.code(400).send({ requestId: request.id, error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Tenant scope is required.', retryable: false } });
    return reply.send(await dependencies.service.find(params.id, actor.tenantId));
  });
  app.post('/api/learning-feedback/:id/withdraw', async (request, reply) => {
    const actor = dependencies.authServices.authService.requirePermission(request, 'learning-feedback:write'); const params = learningFeedbackParamsSchema.parse(request.params);
    if (actor.tenantId === undefined) return reply.code(400).send({ requestId: request.id, error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Tenant scope is required.', retryable: false } });
    const before = await dependencies.service.find(params.id, actor.tenantId);
    const record = await dependencies.service.withdraw(params.id, actor.tenantId, actor.userId, request.id);
    if (before.status !== record.status) dependencies.authServices.auditLogService.record({ actor, operation: 'learning_feedback_withdrawn', resourceType: 'learning_feedback', resourceId: record.id, tenantId: actor.tenantId, before: { status: before.status }, after: { status: record.status }, requestId: request.id });
    return reply.send(record);
  });
  app.post('/api/learning-feedback/:id/review', async (request, reply) => {
    const actor = dependencies.authServices.authService.requirePermission(request, 'learning-feedback:review'); const params = learningFeedbackParamsSchema.parse(request.params); const body = learningFeedbackReviewBodySchema.parse(request.body);
    if (actor.tenantId === undefined) return reply.code(400).send({ requestId: request.id, error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Tenant scope is required.', retryable: false } });
    const before = await dependencies.service.find(params.id, actor.tenantId);
    const record = await dependencies.service.review(params.id, actor.tenantId, actor.userId, body.status, body.reasonCode, body.reasonNote, request.id);
    dependencies.authServices.auditLogService.record({ actor, operation: body.status === 'APPROVED' ? 'learning_feedback_review_approved' : 'learning_feedback_review_rejected', resourceType: 'learning_feedback', resourceId: record.id, tenantId: actor.tenantId, before: { status: before.status }, after: { status: record.status }, requestId: request.id });
    return reply.send(record);
  });
  app.post('/api/learning-feedback/:id/promote-to-gold-set', async (request, reply) => {
    dependencies.authServices.authService.requirePermission(request, 'learning-feedback:review');
    return reply.code(409).send({ requestId: request.id, error: { code: 'GOLD_SET_PROMOTION_UNAVAILABLE', message: 'Gold-set promotion is not implemented.', retryable: false } });
  });
}
