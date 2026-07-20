import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { LLMSettingsService } from './service.js';
import { SecretEncryptionService } from '@job-compliance/core';

describe('LLM settings routes', () => {
  it('masks keys and enforces tenant isolation', async () => {
    const app = buildApp({ llmSettingsService: new LLMSettingsService(new SecretEncryptionService(Buffer.alloc(32, 1))) });
    const created = await app.inject({ method: 'POST', url: '/api/settings/llm-connections', payload: { tenantId: 'tenant-a', displayName: 'test', provider: 'OPENAI_COMPATIBLE', apiKey: 'sk-12345678', auditModel: 'mock', isDefault: false }, headers: { 'x-user-role': 'TENANT_ADMIN', 'x-tenant-id': 'tenant-a' } });
    expect(created.statusCode).toBe(201); expect(created.body).not.toContain('sk-12345678');
    const id = (created.json() as {id:string}).id;
    const forbidden = await app.inject({ method: 'GET', url: `/api/settings/llm-connections/${id}?tenantId=tenant-a`, headers: { 'x-user-role': 'TENANT_ADMIN', 'x-tenant-id': 'tenant-b' } });
    expect(forbidden.statusCode).toBe(403);
    await app.close();
  });
});
