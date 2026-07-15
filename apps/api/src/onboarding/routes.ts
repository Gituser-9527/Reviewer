import type { FastifyInstance } from 'fastify';
import type { AuthServices } from '../auth/service.js';
import type { OnboardingService } from './service.js';

export interface OnboardingRoutesDependencies {
  onboardingService: OnboardingService;
  authServices: AuthServices;
}

export function registerOnboardingRoutes(
  app: FastifyInstance,
  dependencies: OnboardingRoutesDependencies,
): void {
  app.get('/api/onboarding/status', async (request, reply) => {
    const context = dependencies.authServices.authService.requireTenantScope(request);
    return reply.send(
      dependencies.onboardingService.getStatus({
        userId: context.userId,
        ...(context.tenantId === undefined ? {} : { tenantId: context.tenantId }),
        role: context.role,
      }),
    );
  });

  app.post('/api/onboarding/dismiss', async (request, reply) => {
    const context = dependencies.authServices.authService.requireTenantScope(request);
    return reply.send(
      dependencies.onboardingService.dismiss({
        userId: context.userId,
        ...(context.tenantId === undefined ? {} : { tenantId: context.tenantId }),
        role: context.role,
      }),
    );
  });

  app.post('/api/onboarding/complete', async (request, reply) => {
    const context = dependencies.authServices.authService.requireTenantScope(request);
    return reply.code(201).send(
      dependencies.onboardingService.complete({
        userId: context.userId,
        ...(context.tenantId === undefined ? {} : { tenantId: context.tenantId }),
        role: context.role,
      }),
    );
  });
}
