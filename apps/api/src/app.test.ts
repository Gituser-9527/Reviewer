import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('health routes', () => {
  it.each(['/health', '/health/live', '/health/ready'])(
    'returns service health for %s',
    async (url) => {
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
    },
  );
});
