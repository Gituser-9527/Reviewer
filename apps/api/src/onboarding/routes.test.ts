import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];
const headers = {
  'x-user-id': 'onboarding_user_001',
  'x-user-role': 'REVIEWER',
  'x-tenant-id': 'tenant_onboarding_001',
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('onboarding API routes', () => {
  it('records dismissed and completed state for the current tenant user', async () => {
    const app = buildApp();
    apps.push(app);

    const initial = await app.inject({ method: 'GET', url: '/api/onboarding/status', headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({ status: 'not_started', role: 'REVIEWER' });

    const dismissed = await app.inject({ method: 'POST', url: '/api/onboarding/dismiss', headers });
    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json()).toMatchObject({ status: 'dismissed', tenantId: 'tenant_onboarding_001' });

    const completed = await app.inject({ method: 'POST', url: '/api/onboarding/complete', headers });
    expect(completed.statusCode).toBe(201);
    expect(completed.json()).toMatchObject({ status: 'completed', completedAt: expect.any(String) });

    const after = await app.inject({ method: 'GET', url: '/api/onboarding/status', headers });
    expect(after.json()).toMatchObject({ status: 'completed' });
  });
});
