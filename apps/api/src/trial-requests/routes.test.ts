import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { TrialRequestService } from './service.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('trial request API routes', () => {
  it('accepts a public request without returning or storing an unmasked email', async () => {
    const service = new TrialRequestService();
    const app = buildApp({ trialRequestService: service });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/trial-requests',
      payload: {
        companyName: 'Acme Hiring Platform',
        contactName: 'Demo Contact',
        email: 'contact@example.com',
        useCase: 'Review job postings before publication.',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: expect.stringMatching(/^trial_/u), status: 'received' });
    expect(response.body).not.toContain('contact@example.com');

    const saved = service.get(response.json().id);
    expect(saved?.emailMasked).toBe('c***@example.com');
    expect(saved?.emailHash).toHaveLength(64);
  });

  it('validates public request input', async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/trial-requests',
      payload: { companyName: 'A', contactName: '', email: 'not-an-email' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
