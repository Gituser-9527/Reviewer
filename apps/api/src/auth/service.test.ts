import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const environment = { ...process.env };
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const key of Object.keys(process.env)) {
    if (!(key in environment)) delete process.env[key];
  }
  Object.assign(process.env, environment);
});

function configureDevIdentity(nodeEnv = 'test'): void {
  process.env.NODE_ENV = nodeEnv;
  process.env.DEV_EXTENSION_AUTH_ENABLED = 'true';
  process.env.DEV_EXTENSION_AUTH_TOKEN = 'local-test-token';
  process.env.DEV_EXTENSION_TENANT_ID = 'tenant_dev';
}

describe('restricted local extension bearer identity', () => {
  it('binds a valid bearer token to a least-privilege tenant operator', async () => {
    configureDevIdentity();
    const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: 'Bearer local-test-token', 'x-tenant-id': 'tenant_dev', 'x-user-role': 'SUPER_ADMIN', 'x-permissions': '*' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ role: 'AUDIT_OPERATOR', tenantId: 'tenant_dev', permissions: ['audit:read', 'audit:write'] });
  });

  it.each([
    ['missing token', {}],
    ['malformed bearer token', { authorization: 'Token local-test-token', 'x-tenant-id': 'tenant_dev' }],
    ['wrong token', { authorization: 'Bearer wrong-token', 'x-tenant-id': 'tenant_dev' }],
    ['different length token', { authorization: 'Bearer x', 'x-tenant-id': 'tenant_dev' }],
  ])('returns 401 for %s', async (_name, headers) => {
    configureDevIdentity();
    const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'AUTHENTICATION_REQUIRED' } });
  });

  it('rejects a tenant mismatch before audit work starts', async () => {
    configureDevIdentity();
    const app = buildApp({ auditJob: async () => { throw new Error('audit must not run'); } }); apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/audit/job', headers: { authorization: 'Bearer local-test-token', 'x-tenant-id': 'tenant_other' }, payload: { tenantId: 'tenant_other', jobPostingId: 'job', company: { name: 'Example' }, job: { title: 'Role', description: 'Description' }, options: { jurisdiction: 'CN_MAINLAND', enableRewrite: false, enableRag: false } } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'TENANT_FORBIDDEN' } });
  });

  it('disables local bearer authentication outside test or development', async () => {
    configureDevIdentity('production');
    const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: 'Bearer local-test-token', 'x-tenant-id': 'tenant_dev' } });
    expect(response.statusCode).toBe(401);
  });

  it('does not grant the audit operator unrelated management permissions', async () => {
    configureDevIdentity();
    const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/security/launch-check/report', headers: { authorization: 'Bearer local-test-token', 'x-tenant-id': 'tenant_dev' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('keeps the explicit test transport available only in test', async () => {
    process.env.NODE_ENV = 'test';
    const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { 'x-user-role': 'VIEWER', 'x-tenant-id': 'tenant_dev' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ role: 'VIEWER', tenantId: 'tenant_dev' });
  });
});
