import { normalizeEvalCase } from '@job-compliance/core';
import { redactSensitiveText } from '@job-compliance/database';
import type { AuditDecision, HumanReviewTicket, RiskCategory } from '@job-compliance/shared';
import type { AuditRunStore } from '../audit/store.js';
import type { FastifyInstance } from 'fastify';
import type { EvalStore } from '../evals/store.js';
import {
  addReviewToEvalBodySchema,
  createRuleSuggestionBodySchema,
  createReviewBodySchema,
  resolveRuleSuggestionBodySchema,
  reviewListQuerySchema,
  reviewParamsSchema,
  ruleSuggestionListQuerySchema,
  ruleSuggestionParamsSchema,
  submitReviewDecisionBodySchema,
} from './schemas.js';
import type { HumanReviewStore } from './store.js';
import type { AuthServices } from '../auth/service.js';
import type { BetaTrialService } from '../beta-trial/service.js';
import type { LabelingService } from '../labeling/service.js';

/** Dependencies required by human review routes. */
export interface ReviewRoutesDependencies {
  /** Completed audit run storage used to create tickets on demand. */
  auditRunStore: AuditRunStore;
  /** Human review storage. */
  reviewStore: HumanReviewStore;
  /** Evaluation storage used to convert feedback into eval cases. */
  evalStore: EvalStore;
  /** Optional beta trial service used to compare human and Agent decisions. */
  betaTrialService?: BetaTrialService;
  /** Optional labeling service used to enforce unified labels before eval import. */
  labelingService?: LabelingService;
  /** Optional auth services used for RBAC, tenant isolation and audit logs. */
  authServices?: AuthServices;
}

function expectedDecisionFor(ticket: HumanReviewTicket): AuditDecision {
  const finalDecision = ticket.feedback?.finalDecision;
  if (finalDecision === 'APPROVE') return 'PASS';
  if (finalDecision === 'REJECT') return 'REJECT';
  return 'MANUAL_REVIEW';
}

function expectedCategoriesFor(ticket: HumanReviewTicket): RiskCategory[] {
  return [...new Set(ticket.findings.map((finding) => finding.category))] as RiskCategory[];
}

function evalDecisionForHumanDecision(
  decision: NonNullable<HumanReviewTicket['feedback']>['finalDecision'],
): AuditDecision {
  if (decision === 'APPROVE') return 'PASS';
  if (decision === 'REJECT') return 'REJECT';
  return 'MANUAL_REVIEW';
}

/** Registers human review ticket routes. */
export function registerReviewRoutes(
  app: FastifyInstance,
  dependencies: ReviewRoutesDependencies,
): void {
  app.post('/api/reviews', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const body = createReviewBodySchema.parse(request.body);
    if (body.tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, body.tenantId);
    }
    const auditResult = await dependencies.auditRunStore.findById(body.auditRunId, body.tenantId);
    if (auditResult === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'AUDIT_RUN_NOT_FOUND',
          message: 'Audit run was not found.',
          retryable: false,
        },
      });
    }
    const ticket = await dependencies.reviewStore.createFromAuditResult(auditResult);
    if (ticket === undefined) {
      return reply.code(422).send({
        requestId: request.id,
        error: {
          code: 'REVIEW_NOT_REQUIRED',
          message: 'Audit run does not require manual review.',
          retryable: false,
        },
      });
    }
    return reply.code(201).send(ticket);
  });

  app.get('/api/reviews', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'review:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = reviewListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    if (tenantId !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, tenantId);
    }
    const items = await dependencies.reviewStore.list({
      status: query.status,
      ...(tenantId === undefined ? {} : { tenantId }),
    });
    return reply.send({ items });
  });

  app.get('/api/reviews/:id', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'review:read');
    const params = reviewParamsSchema.parse(request.params);
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
    dependencies.authServices?.authService.requireTenantAccess(request, ticket.tenantId);
    return reply.send(ticket);
  });

  app.post('/api/reviews/:id/decision', async (request, reply) => {
    const actor = dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = reviewParamsSchema.parse(request.params);
    const body = submitReviewDecisionBodySchema.parse(request.body);
    const before = await dependencies.reviewStore.findById(params.id);
    if (before !== undefined) {
      dependencies.authServices?.authService.requireTenantAccess(request, before.tenantId);
    }
    const ticket = await dependencies.reviewStore.submitDecision(params.id, body);
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
    if (actor !== undefined) {
      dependencies.authServices?.auditLogService.record({
        actor,
        operation: 'human_review_result_modified',
        resourceType: 'review_ticket',
        resourceId: ticket.id,
        tenantId: ticket.tenantId,
        ...(before === undefined ? {} : { before: before as unknown as Record<string, unknown> }),
        after: ticket as unknown as Record<string, unknown>,
        requestId: request.id,
      });
    }
    dependencies.betaTrialService?.recordHumanResult({
      auditRunId: ticket.auditRunId,
      reviewerId: body.reviewerId,
      finalDecision: body.finalDecision,
      feedbackType: body.feedbackType,
      comment: body.comment,
    });
    return reply.send(ticket);
  });

  app.post('/api/reviews/:id/add-to-eval', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'eval:write');
    const params = reviewParamsSchema.parse(request.params);
    const body = addReviewToEvalBodySchema.parse(request.body);
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
    dependencies.authServices?.authService.requireTenantAccess(request, ticket.tenantId);

    const disputes = dependencies.labelingService?.listDisputedCases({
      status: 'all',
      tenantId: ticket.tenantId,
    });
    const dispute = disputes?.find((entry) => entry.reviewTicketId === ticket.id);
    if (dispute?.status === 'open') {
      return reply.code(409).send({
        requestId: request.id,
        error: {
          code: 'LABEL_DISPUTE_UNRESOLVED',
          message: 'Review labels are disputed and must be resolved before entering eval.',
          retryable: false,
        },
      });
    }
    const reviewerLabels = dependencies.labelingService?.listReviewerDecisions(ticket.id) ?? [];
    const agreedLabel = reviewerLabels[0];
    const unifiedExpectedDecision =
      body.expectedDecision ??
      (dispute?.finalDecision === undefined
        ? agreedLabel === undefined
          ? expectedDecisionFor(ticket)
          : agreedLabel.normalizedDecision
        : evalDecisionForHumanDecision(dispute.finalDecision));
    const unifiedCategories =
      body.expectedCategories ??
      dispute?.finalCategories ??
      agreedLabel?.categories ??
      expectedCategoriesFor(ticket);
    const unifiedSeverity =
      body.expectedSeverity ?? dispute?.finalSeverity ?? agreedLabel?.severity ?? ticket.riskLevel;

    await dependencies.evalStore.createDataset({
      id: body.datasetId,
      name: 'Human Review Feedback',
      version: 'v1',
      description: 'Samples converted from human review feedback.',
    });

    const jobPosting = ticket.jobPosting;
    const caseInput = normalizeEvalCase({
      id: `case_from_review_${ticket.id}`,
      datasetId: body.datasetId,
      source: body.source,
      ...(jobPosting === undefined ? {} : { jobInput: jobPosting }),
      title: redactSensitiveText(jobPosting?.title ?? `Review ${ticket.id}`),
      description: redactSensitiveText(jobPosting?.description ?? ticket.summary),
      expectedDecision: unifiedExpectedDecision,
      expectedCategories: unifiedCategories,
      expectedSeverity: unifiedSeverity,
      humanReason: redactSensitiveText(
        body.humanReason ?? ticket.feedback?.comment ?? 'Converted from human review feedback.',
      ),
      metadata: {
        labelSchemaVersion: 'review-label-v1',
        unifiedLabel: {
          finalDecision: dispute?.finalDecision ?? agreedLabel?.finalDecision ?? ticket.feedback?.finalDecision,
          expectedDecision: unifiedExpectedDecision,
          categories: unifiedCategories,
          severity: unifiedSeverity,
          feedbackType: agreedLabel?.feedbackType ?? ticket.feedback?.feedbackType,
          source: dispute?.status === 'resolved' ? 'senior_resolution' : agreedLabel === undefined ? 'single_review_feedback' : 'reviewer_decision',
        },
        reviewerDecisionIds: reviewerLabels.map((label) => label.id),
        disputeId: dispute?.id,
        reviewTicketId: ticket.id,
        auditRunId: ticket.auditRunId,
        feedbackType: ticket.feedback?.feedbackType,
        agentDecision: ticket.agentDecision,
        finalDecision: ticket.feedback?.finalDecision,
      },
    });
    const items = await dependencies.evalStore.addCases(body.datasetId, [caseInput]);
    return reply.code(201).send({ imported: 1, case: caseInput, items });
  });

  app.post('/api/reviews/:id/create-rule-suggestion', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = reviewParamsSchema.parse(request.params);
    const body = createRuleSuggestionBodySchema.parse(request.body);
    const suggestion = await dependencies.reviewStore.createRuleSuggestion({
      reviewTicketId: params.id,
      createdBy: body.createdBy,
      ...(body.feedbackType === undefined ? {} : { feedbackType: body.feedbackType }),
      ...(body.category === undefined ? {} : { category: body.category }),
      ...(body.ruleId === undefined ? {} : { ruleId: body.ruleId }),
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined
        ? {}
        : { description: redactSensitiveText(body.description) }),
    });
    if (suggestion === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review ticket was not found.',
          retryable: false,
        },
      });
    }
    dependencies.authServices?.authService.requireTenantAccess(request, suggestion.tenantId);
    return reply.code(201).send(suggestion);
  });

  app.get('/api/rule-suggestions', async (request, reply) => {
    const context = dependencies.authServices?.authService.requirePermission(request, 'review:read');
    dependencies.authServices?.authService.requireTenantScope(request);
    const query = ruleSuggestionListQuerySchema.parse(request.query);
    const tenantId = context?.role === 'SUPER_ADMIN' ? query.tenantId : (context?.tenantId ?? query.tenantId);
    const items = await dependencies.reviewStore.listRuleSuggestions({
      status: query.status,
      ...(tenantId === undefined ? {} : { tenantId }),
    });
    return reply.send({ items });
  });

  app.post('/api/rule-suggestions/:id/resolve', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'review:write');
    const params = ruleSuggestionParamsSchema.parse(request.params);
    const body = resolveRuleSuggestionBodySchema.parse(request.body);
    const suggestion = await dependencies.reviewStore.resolveRuleSuggestion(params.id, {
      resolvedBy: body.resolvedBy,
      ...(body.resolutionComment === undefined
        ? {}
        : { resolutionComment: redactSensitiveText(body.resolutionComment) }),
    });
    if (suggestion === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'RULE_SUGGESTION_NOT_FOUND',
          message: 'Rule improvement suggestion was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(suggestion);
  });
}
