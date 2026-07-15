import type { FastifyInstance } from 'fastify'; import { z } from 'zod';
import type { AuthServices } from '../auth/service.js'; import { ExtensionAuthError, ExtensionAuthService, extensionScopes, type ExtensionScope } from './service.js';
const authorizeSchema = z.object({ extensionClientId: z.string().min(1).max(200), scopes: z.array(z.enum(extensionScopes)).min(1) });
const tokenSchema = z.object({ extensionClientId: z.string().min(1), authorizationCode: z.string().min(20) });
const bearer = (value: unknown) => typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : undefined;
export function registerExtensionAuthRoutes(app: FastifyInstance, auth: AuthServices, service: ExtensionAuthService): void {
  app.post('/api/extension-auth/authorize', async (request) => { const context = auth.authService.requirePermission(request, 'audit:read'); auth.authService.requireTenantScope(request); const body = authorizeSchema.parse(request.body); return service.authorize(context, body.extensionClientId, body.scopes); });
  app.post('/api/extension-auth/token', async (request) => { const body = tokenSchema.parse(request.body); return service.exchange(body.extensionClientId, body.authorizationCode); });
  app.post('/api/extension-auth/revoke', async (request, reply) => { const token = bearer(request.headers.authorization); if (token) service.revoke(token); return reply.code(204).send(); });
  app.get('/api/extension-auth/session', async (request) => { const token = bearer(request.headers.authorization); if (!token) throw new ExtensionAuthError('EXTENSION_NOT_AUTHENTICATED'); const current = service.authenticate(token, 'web_capture:read'); return { connected: true, user: { id: current.context.userId, displayName: current.context.userId }, tenant: { id: current.context.tenantId ?? 'default', name: current.context.tenantId ?? 'Default Tenant' }, scopes: current.scopes, expiresAt: new Date(current.expiresAt).toISOString() }; });
}
