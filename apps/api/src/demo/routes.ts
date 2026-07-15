import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import type { DemoService } from './service.js';

export interface DemoRoutesDependencies {
  service: DemoService;
  authServices?: AuthServices;
}

export function registerDemoRoutes(
  app: FastifyInstance,
  dependencies: DemoRoutesDependencies,
): void {
  app.get('/api/demo', async (_request, reply) => {
    const snapshot = await dependencies.service.snapshot();
    return reply.send(snapshot);
  });

  app.post('/api/demo/seed', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const snapshot = await dependencies.service.seed();
    return reply.code(201).send(snapshot);
  });

  app.post('/api/demo/reset', async (request, reply) => {
    dependencies.authServices?.authService.requirePermission(request, 'global:manage');
    const snapshot = await dependencies.service.reset();
    return reply.send(snapshot);
  });
}
