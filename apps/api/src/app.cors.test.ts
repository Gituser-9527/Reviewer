import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const environment = { ...process.env };
const apps: ReturnType<typeof buildApp>[] = [];
const allowedOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});

function configureCors(nodeEnv = 'test'): void {
  process.env.NODE_ENV = nodeEnv;
  process.env.DEV_EXTENSION_AUTH_ENABLED = 'true';
  process.env.DEV_EXTENSION_ORIGINS = `${allowedOrigin}, chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, *, chrome-extension://invalid, chrome-extension://*`;
}

describe('development extension CORS boundary', () => {
  it('allows only an exact configured extension preflight', async () => {
    configureCors(); const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'OPTIONS', url: '/api/audit/job', headers: { origin: allowedOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type, x-tenant-id' } });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers.vary).toBe('Origin');
  });

  it.each([
    ['other extension', 'chrome-extension://cccccccccccccccccccccccccccccccc', 'POST', 'authorization'],
    ['invalid extension identifier', 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'POST', 'authorization'],
    ['web origin', 'https://evil.example', 'POST', 'authorization'],
    ['null origin', 'null', 'POST', 'authorization'],
    ['unsafe method', allowedOrigin, 'DELETE', 'authorization'],
    ['unsafe header', allowedOrigin, 'POST', 'cookie'],
  ])('rejects %s', async (_name, origin, method, headers) => {
    configureCors(); const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'OPTIONS', url: '/api/audit/job', headers: { origin, 'access-control-request-method': method, 'access-control-request-headers': headers } });
    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not enable extension CORS in production', async () => {
    configureCors('production'); const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'OPTIONS', url: '/api/audit/job', headers: { origin: allowedOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' } });
    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not block non-browser requests without an Origin header', async () => {
    configureCors(); const app = buildApp(); apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/product/plans' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
