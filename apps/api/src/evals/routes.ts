import { randomUUID } from 'node:crypto';
import { normalizeEvalCase, type EvalCaseInput } from '@job-compliance/core';
import type { RiskCategory } from '@job-compliance/shared';
import { redactSensitiveText } from '@job-compliance/database';
import type { FastifyInstance } from 'fastify';
import type { HumanReviewStore } from '../reviews/store.js';
import type { AuthServices } from '../auth/service.js';
import {
  addCasesBodySchema,
  createDatasetBodySchema,
  datasetParamsSchema,
  runEvalBodySchema,
  runParamsSchema,
} from './schemas.js';
import { parseJsonlCases, type EvalStore } from './store.js';

export interface EvalRoutesDependencies {
  evalStore: EvalStore;
  reviewStore: HumanReviewStore;
  authServices?: AuthServices;
}

export function registerEvalRoutes(
  app: FastifyInstance,
  dependencies: EvalRoutesDependencies,
): void {
  app.get('/api/evals/datasets', async (_request, reply) => {
    const items = await dependencies.evalStore.listDatasets();
    return reply.send({ items });
  });

  app.post('/api/evals/datasets', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'eval:write');
    const body = createDatasetBodySchema.parse(request.body);
    const dataset = await dependencies.evalStore.createDataset({
      id: body.id ?? `dataset_${randomUUID()}`,
      name: redactSensitiveText(body.name),
      version: body.version,
      ...(body.description === undefined
        ? {}
        : { description: redactSensitiveText(body.description) }),
    });
    return reply.code(201).send(dataset);
  });

  app.get('/api/evals/datasets/:id/cases', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'eval:read');
    const params = datasetParamsSchema.parse(request.params);
    const items = await dependencies.evalStore.listCases(params.id);
    return reply.send({ items });
  });

  app.post('/api/evals/datasets/:id/cases', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'eval:write');
    const params = datasetParamsSchema.parse(request.params);
    const body = addCasesBodySchema.parse(request.body);
    const cases: EvalCaseInput[] = [];

    if (body.jsonl !== undefined) {
      cases.push(...parseJsonlCases(body.jsonl, params.id));
    }

    if (body.cases !== undefined) {
      cases.push(
        ...body.cases.map((entry) => {
          const normalized: EvalCaseInput = {
            id: entry.id,
            datasetId: params.id,
            source: entry.source,
            description: redactSensitiveText(entry.description),
            expectedDecision: entry.expectedDecision,
            expectedCategories: entry.expectedCategories,
            ...(entry.title === undefined ? {} : { title: redactSensitiveText(entry.title) }),
            ...(entry.expectedSeverity === undefined
              ? {}
              : { expectedSeverity: entry.expectedSeverity }),
            ...(entry.humanReason === undefined
              ? {}
              : { humanReason: redactSensitiveText(entry.humanReason) }),
            ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
          };
          return normalizeEvalCase(normalized);
        }),
      );
    }

    if (body.fromReviewTicketId !== undefined) {
      const ticket = await dependencies.reviewStore.findById(body.fromReviewTicketId);
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
      const finalDecision = ticket.feedback?.finalDecision;
      const expectedDecision =
        body.expectedDecision ??
        (finalDecision === 'APPROVE'
          ? 'PASS'
          : finalDecision === 'REJECT'
            ? 'REJECT'
            : 'MANUAL_REVIEW');
      const expectedCategories =
        body.expectedCategories ??
        ([...new Set(ticket.findings.map((finding) => finding.category))] as RiskCategory[]);
      cases.push(
        normalizeEvalCase({
          id: `case_from_review_${ticket.id}`,
          datasetId: params.id,
          source: body.source,
          title: redactSensitiveText(body.title ?? `Review ${ticket.id}`),
          description: redactSensitiveText(body.description ?? ticket.summary),
          expectedDecision,
          expectedCategories,
          expectedSeverity: body.expectedSeverity ?? ticket.riskLevel,
          humanReason: redactSensitiveText(
            body.humanReason ?? ticket.feedback?.comment ?? 'Converted from human review feedback.',
          ),
          metadata: {
            reviewTicketId: ticket.id,
            auditRunId: ticket.auditRunId,
          },
        }),
      );
    }

    const items = await dependencies.evalStore.addCases(params.id, cases);
    return reply.code(201).send({ imported: cases.length, items });
  });

  app.get('/api/evals/runs', async (_request, reply) => {
    const items = await dependencies.evalStore.listRuns();
    return reply.send({ items });
  });

  app.post('/api/evals/run', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'eval:write');
    const body = runEvalBodySchema.parse(request.body);
    const report = await dependencies.evalStore.runDataset({
      datasetId: body.datasetId,
      ...(body.ruleVersion === undefined ? {} : { ruleVersion: body.ruleVersion }),
      ...(body.lawKbVersion === undefined ? {} : { lawKbVersion: body.lawKbVersion }),
      modelVersion: body.enableRealLlm ? body.modelVersion : 'mock',
    });
    return reply.code(201).send(report);
  });

  app.get('/api/evals/runs/:id', async (request, reply) => {
    const params = runParamsSchema.parse(request.params);
    const run = await dependencies.evalStore.findRun(params.id);
    if (run === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'EVAL_RUN_NOT_FOUND',
          message: 'Eval run was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(run);
  });

  app.get('/api/evals/runs/:id/failures', async (request, reply) => {
    const params = runParamsSchema.parse(request.params);
    const items = await dependencies.evalStore.listFailures(params.id);
    return reply.send({ items });
  });
}
