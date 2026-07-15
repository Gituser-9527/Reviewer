import type { FastifyInstance } from 'fastify';
import { createTrialRequestSchema } from './schemas.js';
import type { TrialRequestService } from './service.js';

export interface TrialRequestRoutesDependencies {
  service: TrialRequestService;
}

/** Public endpoint intentionally does not require tenant authentication. */
export function registerTrialRequestRoutes(
  app: FastifyInstance,
  dependencies: TrialRequestRoutesDependencies,
): void {
  app.post('/api/trial-requests', async (request, reply) => {
    const input = createTrialRequestSchema.parse(request.body);
    return reply.code(201).send(dependencies.service.create(input));
  });
}
