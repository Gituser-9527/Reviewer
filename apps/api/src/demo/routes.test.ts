import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { demoTenantId } from './service.js';

const adminHeaders = {
  'x-user-id': 'demo_test_admin',
  'x-user-role': 'SUPER_ADMIN',
  'x-tenant-id': demoTenantId,
};

describe('demo routes', () => {
  it('seeds and resets safe demo data', async () => {
    const app = buildApp();
    try {
      const seed = await app.inject({
        method: 'POST',
        url: '/api/demo/seed',
        headers: adminHeaders,
      });
      expect(seed.statusCode).toBe(201);
      const seeded = seed.json();
      expect(seeded.tenant.id).toBe(demoTenantId);
      expect(seeded.auditCases.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(seeded)).not.toMatch(/\b1[3-9]\d{9}\b/u);
      expect(JSON.stringify(seeded)).not.toMatch(/\b\d{17}[\dXx]\b/u);

      const auditRuns = await app.inject({
        method: 'GET',
        url: `/api/audit/runs?tenantId=${demoTenantId}`,
        headers: adminHeaders,
      });
      expect(auditRuns.statusCode).toBe(200);
      expect(auditRuns.json().items.length).toBeGreaterThanOrEqual(3);

      const reviews = await app.inject({
        method: 'GET',
        url: `/api/reviews?status=all&tenantId=${demoTenantId}`,
        headers: adminHeaders,
      });
      expect(reviews.statusCode).toBe(200);
      expect(reviews.json().items.length).toBeGreaterThanOrEqual(1);

      const reset = await app.inject({
        method: 'POST',
        url: '/api/demo/reset',
        headers: adminHeaders,
      });
      expect(reset.statusCode).toBe(200);
      const resetPayload = reset.json();
      expect(resetPayload.auditRuns).toHaveLength(0);
      expect(resetPayload.reviewTickets).toHaveLength(0);
      expect(resetPayload.evalRuns).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
