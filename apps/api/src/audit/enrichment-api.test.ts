import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
describe('enrichment query api', () => {
  it('requires tenant context when persistence is unavailable', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/runs/a/enrichment',
      headers: { 'x-user-role': 'TENANT_ADMIN', 'x-tenant-id': 't' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
  it('returns persisted finding coverage without prompt or job payload data', async () => {
    const app = buildApp({
      observabilityRepository: {
        saveTrace: async () => undefined,
        findTrace: async () => null,
        listUsage: async () => [],
        enqueue: async () => ({}),
        listEnrichment: async () => [
          {
            task_type: 'AUDIT_GENERATE_REWRITE',
            safety_result: {
              findingCoverage: {
                addressedFindingIds: ['f1'],
                unaddressedFindingIds: [],
                unknownFindingIds: [],
              },
            },
            result: { description: 'safe' },
          },
        ],
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/runs/a/enrichment?tenantId=t',
      headers: { 'x-user-role': 'TENANT_ADMIN', 'x-tenant-id': 't' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      rewrite: { safety_result: { findingCoverage: { addressedFindingIds: ['f1'] } } },
    });
    expect(response.body).not.toContain('prompt');
    expect(response.body).not.toContain('payload');
    await app.close();
  });
});
