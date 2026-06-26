import type { FastifyInstance } from 'fastify';
import type { HumanReviewStore } from '../reviews/store.js';
import {
  disputedCaseListQuerySchema,
  disputedCaseParamsSchema,
  resolveDisputedCaseBodySchema,
  reviewParamsSchema,
  submitReviewerDecisionBodySchema,
} from './schemas.js';
import type { LabelingService } from './service.js';

export interface LabelingRoutesDependencies {
  reviewStore: HumanReviewStore;
  labelingService: LabelingService;
}

export function registerLabelingRoutes(
  app: FastifyInstance,
  dependencies: LabelingRoutesDependencies,
): void {
  const service = dependencies.labelingService;

  app.get('/api/labeling/reference', async (_request, reply) => {
    return reply.send(service.getReference());
  });

  app.post('/api/reviews/:id/reviewer-decisions', async (request, reply) => {
    const params = reviewParamsSchema.parse(request.params);
    const body = submitReviewerDecisionBodySchema.parse(request.body);
    const ticket = await dependencies.reviewStore.findById(params.id);
    if (ticket === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review ticket was not found.',
          retryable: false,
        },
      });
    }
    const decision = service.submitReviewerDecision({
      ticket,
      reviewerId: body.reviewerId,
      finalDecision: body.finalDecision,
      categories: body.categories,
      severity: body.severity,
      feedbackType: body.feedbackType,
      comment: body.comment,
      confidence: body.confidence,
    });
    return reply.code(201).send(decision);
  });

  app.get('/api/reviews/:id/reviewer-decisions', async (request, reply) => {
    const params = reviewParamsSchema.parse(request.params);
    return reply.send({ items: service.listReviewerDecisions(params.id) });
  });

  app.get('/api/reviewer-agreement-stats', async (_request, reply) => {
    return reply.send({ items: service.listAgreementStats() });
  });

  app.get('/api/disputed-cases', async (request, reply) => {
    const query = disputedCaseListQuerySchema.parse(request.query);
    return reply.send({
      items: service.listDisputedCases({
        status: query.status,
        ...(query.tenantId === undefined ? {} : { tenantId: query.tenantId }),
      }),
    });
  });

  app.get('/api/disputed-cases/:id', async (request, reply) => {
    const params = disputedCaseParamsSchema.parse(request.params);
    const dispute = service.findDisputedCase(params.id);
    if (dispute === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'DISPUTED_CASE_NOT_FOUND',
          message: 'Disputed case was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(dispute);
  });

  app.post('/api/disputed-cases/:id/resolve', async (request, reply) => {
    const params = disputedCaseParamsSchema.parse(request.params);
    const body = resolveDisputedCaseBodySchema.parse(request.body);
    const resolved = service.resolveDisputedCase(params.id, {
      resolvedBy: body.resolvedBy,
      finalDecision: body.finalDecision,
      finalCategories: body.finalCategories,
      finalSeverity: body.finalSeverity,
      resolutionComment: body.resolutionComment,
    });
    if (resolved === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'DISPUTED_CASE_NOT_FOUND',
          message: 'Disputed case was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(resolved);
  });
}
