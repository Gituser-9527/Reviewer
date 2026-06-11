import { fileURLToPath } from 'node:url';
import { auditJobPosting, MockEvidenceRetriever } from '@job-compliance/core';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import type { FastifyInstance } from 'fastify';
import { auditJobRequestSchema, auditRunParamsSchema, type AuditJobRequest } from './schemas.js';
import type { AuditRunStore } from './store.js';

/** Function signature used to invoke the core audit orchestrator. */
export type AuditJobHandler = (
  input: JobPostingInput,
  request: AuditJobRequest,
) => Promise<AuditResult>;

/** Dependencies required by audit API routes. */
export interface AuditRoutesDependencies {
  /** Storage used for completed audit runs. */
  store: AuditRunStore;
  /** Optional audit function override used by tests. */
  auditJob?: AuditJobHandler;
}

const rulesDirectory = fileURLToPath(new URL('../../../../rules/cn-mainland/', import.meta.url));

function toCoreInput(request: AuditJobRequest): JobPostingInput {
  return {
    externalId: request.jobPostingId,
    title: request.job.title,
    description: request.job.description,
    companyName: request.company.name,
    ...(request.job.location === undefined ? {} : { location: request.job.location }),
    ...(request.job.employmentType === undefined
      ? {}
      : { employmentType: request.job.employmentType.toUpperCase() }),
    ...(request.job.salary === undefined ? {} : { salary: { text: request.job.salary } }),
    ...(request.job.responsibilities === undefined
      ? {}
      : { responsibilities: request.job.responsibilities }),
    ...(request.job.requirements === undefined ? {} : { requirements: request.job.requirements }),
    metadata: {
      enableRewrite: request.options.enableRewrite,
      enableRag: request.options.enableRag,
    },
  };
}

const defaultAuditJob: AuditJobHandler = async (input, request) =>
  auditJobPosting(input, {
    tenantId: request.tenantId,
    jurisdiction: request.options.jurisdiction,
    rulesDirectory,
    evidenceRetriever: new MockEvidenceRetriever(),
  });

/** Registers audit submission and retrieval routes. */
export function registerAuditRoutes(
  app: FastifyInstance,
  dependencies: AuditRoutesDependencies,
): void {
  const auditJob = dependencies.auditJob ?? defaultAuditJob;

  app.post('/api/audit/job', async (request, reply) => {
    const body = auditJobRequestSchema.parse(request.body);
    const result = await auditJob(toCoreInput(body), body);
    dependencies.store.save(result);
    return reply.code(201).send(result);
  });

  app.get('/api/audit/runs/:id', async (request, reply) => {
    const params = auditRunParamsSchema.parse(request.params);
    const result = dependencies.store.findById(params.id);
    if (result === undefined) {
      return reply.code(404).send({
        requestId: request.id,
        error: {
          code: 'AUDIT_RUN_NOT_FOUND',
          message: 'Audit run was not found.',
          retryable: false,
        },
      });
    }
    return reply.send(result);
  });
}
