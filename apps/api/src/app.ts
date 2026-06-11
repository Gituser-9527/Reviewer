import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthResponse } from '@job-compliance/shared';
import { ZodError } from 'zod';
import { registerAuditRoutes, type AuditJobHandler } from './audit/routes.js';
import { InMemoryAuditRunStore, type AuditRunStore } from './audit/store.js';

const serviceName = 'job-compliance-api';

function healthPayload(): HealthResponse {
  return {
    service: serviceName,
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/** Optional dependencies used to isolate API tests and future persistence adapters. */
export interface BuildAppOptions {
  /** Process-local or persistent audit run store. */
  auditRunStore?: AuditRunStore;
  /** Optional core audit handler override. */
  auditJob?: AuditJobHandler;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        requestId: request.id,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          retryable: false,
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            reason: issue.message,
          })),
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({
      requestId: request.id,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The audit request could not be completed.',
        retryable: false,
      },
    });
  });

  app.get('/health', async () => healthPayload());
  app.get('/health/live', async () => healthPayload());
  app.get('/health/ready', async () => healthPayload());

  registerAuditRoutes(app, {
    store: options.auditRunStore ?? new InMemoryAuditRunStore(),
    ...(options.auditJob === undefined ? {} : { auditJob: options.auditJob }),
  });

  return app;
}
