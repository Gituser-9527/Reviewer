import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('health routes', () => {
  it.each(['/health', '/health/live'])('returns service health for %s', async (url) => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      service: 'job-compliance-api',
      status: 'ok',
    });
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it('returns readiness details when dependencies are healthy', async () => {
    const app = buildApp({
      readinessChecks: [{ name: 'postgres', check: async () => true }],
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      service: 'job-compliance-api',
      status: 'ok',
      checks: {
        postgres: 'ok',
      },
    });
  });

  it('returns 503 readiness when a dependency is unavailable', async () => {
    const app = buildApp({
      readinessChecks: [{ name: 'postgres', check: async () => false }],
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    const payload = response.json();

    expect(response.statusCode).toBe(503);
    expect(payload).toMatchObject({
      service: 'job-compliance-api',
      status: 'degraded',
      checks: {
        postgres: 'degraded',
      },
    });
  });
});

describe('metrics route', () => {
  it('returns a Prometheus-compatible metrics placeholder', async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('job_compliance_api_requests_total');
  });
});
