import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import type { EvalStore } from '../evals/store.js';
import type { RuntimeServices } from '../runtime/services.js';
import {
  approveSuggestionSchema,
  createLawKbRolloutSchema,
  createSuggestionSchema,
  createTrustedSourceSchema,
  documentDiffQuerySchema,
  documentParamsSchema,
  importLawKbDocumentSchema,
  sourceParamsSchema,
  suggestionListQuerySchema,
  suggestionParamsSchema,
  versionParamsSchema,
} from './schemas.js';
import type { LawKbUpdateService } from './service.js';

export interface KnowledgeUpdateRoutesDependencies {
  service: LawKbUpdateService;
  evalStore: EvalStore;
  runtimeServices: RuntimeServices;
  authServices?: AuthServices;
}

function notFound(requestId: string, code: string, message: string): Record<string, unknown> {
  return {
    requestId,
    error: { code, message, retryable: false },
  };
}

export function registerKnowledgeUpdateRoutes(
  app: FastifyInstance,
  dependencies: KnowledgeUpdateRoutesDependencies,
): void {
  const { service, evalStore, runtimeServices, authServices } = dependencies;

  app.post('/api/law-kb/sources', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const body = createTrustedSourceSchema.parse(request.body);
    const source = service.createTrustedSource(body);
    return reply.code(201).send(source);
  });

  app.get('/api/law-kb/sources', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    return reply.send({ items: service.listTrustedSources() });
  });

  app.post('/api/law-kb/sources/:id/check', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const params = sourceParamsSchema.parse(request.params);
    const result = service.checkTrustedSource(params.id);
    if (result === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'TRUSTED_SOURCE_NOT_FOUND', 'Trusted source was not found.'));
    }
    return reply.send(result);
  });

  app.post('/api/law-kb/documents/import', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const body = importLawKbDocumentSchema.parse(request.body);
    const result = service.importDocument(body);
    return reply.code(201).send(result);
  });

  app.get('/api/law-kb/documents', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    return reply.send({ items: service.listDocuments() });
  });

  app.get('/api/law-kb/documents/:id/diff', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    const params = documentParamsSchema.parse(request.params);
    const query = documentDiffQuerySchema.parse(request.query);
    const diff = service.getDiff(params.id, query.version);
    if (diff === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'LAW_KB_DOCUMENT_NOT_FOUND', 'Law KB document was not found.'));
    }
    return reply.send(diff);
  });

  app.post('/api/law-kb/suggestions', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const body = createSuggestionSchema.parse(request.body);
    const suggestion = service.createSuggestion(body.documentVersionId);
    if (suggestion === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'LAW_KB_VERSION_NOT_FOUND', 'Document version was not found.'));
    }
    return reply.code(201).send(suggestion);
  });

  app.get('/api/law-kb/suggestions', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    const query = suggestionListQuerySchema.parse(request.query);
    return reply.send({ items: service.listSuggestions(query.status) });
  });

  app.get('/api/law-kb/suggestions/:id', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    const params = suggestionParamsSchema.parse(request.params);
    const suggestion = service.findSuggestion(params.id);
    if (suggestion === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'LAW_KB_SUGGESTION_NOT_FOUND', 'Suggestion was not found.'));
    }
    return reply.send(suggestion);
  });

  app.post('/api/law-kb/suggestions/:id/approve', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const params = suggestionParamsSchema.parse(request.params);
    const body = approveSuggestionSchema.parse(request.body);
    let evalRunId: string | undefined;
    if (body.runEval) {
      const report = await evalStore.runDataset({
        datasetId: body.datasetId,
        lawKbVersion: body.lawKbVersion ?? `candidate-from-${params.id}`,
        modelVersion: 'mock',
      });
      evalRunId = report.id;
    }
    const version = service.approveSuggestion(params.id, body, evalRunId);
    if (version === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'LAW_KB_SUGGESTION_NOT_FOUND', 'Suggestion was not found.'));
    }
    runtimeServices.runtimeConfigService.updateConfig('lawKbVersion', {
      candidateVersion: version.lawKbVersion,
      description: `Candidate from ${params.id}`,
      updatedBy: body.approvedBy,
    });
    return reply.send(version);
  });

  app.get('/api/law-kb/versions', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    return reply.send({ items: service.listVersions() });
  });

  app.post('/api/law-kb/versions/:version/rollout', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'global:manage');
    const params = versionParamsSchema.parse(request.params);
    const body = createLawKbRolloutSchema.parse(request.body);
    const rollout = runtimeServices.rolloutService.createRollout({
      target: 'lawKbVersion',
      stableVersion: body.stableVersion,
      candidateVersion: params.version,
      tenantAllowList: body.tenantAllowList,
      rolloutPercent: body.rolloutPercent,
      createdBy: body.createdBy,
      description: `Law KB rollout for ${params.version}`,
    });
    return reply.code(201).send(rollout);
  });

  app.get('/api/law-kb/impact-reports/:id', async (request, reply) => {
    authServices?.authService.requirePermission(request, 'runtime:read');
    const params = suggestionParamsSchema.parse(request.params);
    const report = service.findImpactReportBySuggestion(params.id);
    if (report === undefined) {
      return reply
        .code(404)
        .send(notFound(request.id, 'LAW_KB_IMPACT_NOT_FOUND', 'Impact report was not found.'));
    }
    return reply.send(report);
  });
}
