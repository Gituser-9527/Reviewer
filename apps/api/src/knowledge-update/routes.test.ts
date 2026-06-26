import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('law KB update agent routes', () => {
  it('imports documents, creates diff and suggestion, approves a new lawKbVersion, and rolls it out', async () => {
    const app = buildApp();
    apps.push(app);

    const sourceResponse = await app.inject({
      method: 'POST',
      url: '/api/law-kb/sources',
      payload: {
        name: '人社部公开政策库',
        sourceType: 'LAW',
        baseUrl: 'https://example.gov.cn/employment',
        jurisdiction: 'CN_MAINLAND',
        scope: 'employment_compliance',
      },
    });
    expect(sourceResponse.statusCode).toBe(201);
    const source = sourceResponse.json<{ id: string }>();

    const checkResponse = await app.inject({
      method: 'POST',
      url: `/api/law-kb/sources/${source.id}/check`,
    });
    expect(checkResponse.statusCode).toBe(200);
    expect(checkResponse.json()).toMatchObject({
      status: 'manual_import_required',
    });

    const importV1Response = await app.inject({
      method: 'POST',
      url: '/api/law-kb/documents/import',
      payload: {
        sourceId: source.id,
        title: '就业公平政策摘要',
        sourceUrl: 'https://example.gov.cn/employment/fair-v1',
        sourceType: 'LAW',
        jurisdiction: 'CN_MAINLAND',
        scope: 'job_posting',
        publishedAt: '2026-06-01T00:00:00.000Z',
        effectiveFrom: '2026-07-01T00:00:00.000Z',
        version: 'v1',
        categories: ['DISCRIMINATION'],
        keywords: ['性别限制', 'CN_DISCRIMINATION_GENDER_001'],
        importedBy: 'law_operator',
        content: ['不得设置与履职无关的性别限制。', '招聘信息应保持真实、完整。'].join('\n'),
      },
    });
    expect(importV1Response.statusCode).toBe(201);
    const importedV1 = importV1Response.json<{
      document: { id: string };
      version: { id: string };
      diff: { addedClauses: unknown[] };
    }>();
    expect(importedV1.diff.addedClauses).toHaveLength(2);

    const importV2Response = await app.inject({
      method: 'POST',
      url: '/api/law-kb/documents/import',
      payload: {
        sourceId: source.id,
        documentId: importedV1.document.id,
        title: '就业公平政策摘要',
        sourceUrl: 'https://example.gov.cn/employment/fair-v1',
        sourceType: 'LAW',
        jurisdiction: 'CN_MAINLAND',
        scope: 'job_posting',
        publishedAt: '2026-06-20T00:00:00.000Z',
        effectiveFrom: '2026-08-01T00:00:00.000Z',
        version: 'v2',
        categories: ['DISCRIMINATION', 'PLATFORM_POLICY'],
        keywords: ['性别限制', '婚育限制', 'CN_DISCRIMINATION_MARRIAGE_001'],
        importedBy: 'law_operator',
        content: [
          '不得设置与履职无关的性别、婚育限制。',
          '招聘信息应保持真实、完整。',
          '平台应为争议岗位提供申诉和复核渠道。',
        ].join('\n'),
      },
    });
    expect(importV2Response.statusCode).toBe(201);
    const importedV2 = importV2Response.json<{
      version: { id: string };
      diff: { addedClauses: unknown[]; deprecatedClauses: unknown[] };
    }>();
    expect(importedV2.diff.addedClauses.length).toBeGreaterThan(0);
    expect(importedV2.diff.deprecatedClauses.length).toBeGreaterThan(0);

    const diffResponse = await app.inject({
      method: 'GET',
      url: `/api/law-kb/documents/${importedV1.document.id}/diff?version=v2`,
    });
    expect(diffResponse.statusCode).toBe(200);
    expect(diffResponse.json()).toMatchObject({
      fromVersion: 'v1',
      toVersion: 'v2',
    });

    const suggestionResponse = await app.inject({
      method: 'POST',
      url: '/api/law-kb/suggestions',
      payload: {
        documentVersionId: importedV2.version.id,
      },
    });
    expect(suggestionResponse.statusCode).toBe(201);
    const suggestion = suggestionResponse.json<{ id: string; status: string; impactSummary: string }>();
    expect(suggestion.status).toBe('pending');
    expect(suggestion.impactSummary).toContain('适用地区：CN_MAINLAND');

    const impactResponse = await app.inject({
      method: 'GET',
      url: `/api/law-kb/impact-reports/${suggestion.id}`,
    });
    expect(impactResponse.statusCode).toBe(200);
    expect(impactResponse.json()).toMatchObject({
      suggestionId: suggestion.id,
      affectedCategories: expect.arrayContaining(['DISCRIMINATION']),
    });

    const approveResponse = await app.inject({
      method: 'POST',
      url: `/api/law-kb/suggestions/${suggestion.id}/approve`,
      payload: {
        approvedBy: 'law_reviewer',
        lawKbVersion: 'lawkb-test-v2',
        datasetId: 'law_kb_empty_eval',
        runEval: true,
      },
    });
    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json()).toMatchObject({
      lawKbVersion: 'lawkb-test-v2',
      suggestionId: suggestion.id,
      approvedBy: 'law_reviewer',
    });
    expect(approveResponse.json<{ evalRunId?: string }>().evalRunId).toBeDefined();

    const runtimeResponse = await app.inject({
      method: 'GET',
      url: '/api/runtime-configs',
    });
    expect(runtimeResponse.statusCode).toBe(200);
    expect(runtimeResponse.json<{ items: Array<{ key: string; candidateVersion?: string }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'lawKbVersion', candidateVersion: 'lawkb-test-v2' }),
      ]),
    );

    const rolloutResponse = await app.inject({
      method: 'POST',
      url: '/api/law-kb/versions/lawkb-test-v2/rollout',
      payload: {
        stableVersion: 'local-2026-06-12',
        tenantAllowList: ['tenant_law_kb'],
        rolloutPercent: 10,
        createdBy: 'law_reviewer',
      },
    });
    expect(rolloutResponse.statusCode).toBe(201);
    expect(rolloutResponse.json()).toMatchObject({
      target: 'lawKbVersion',
      candidateVersion: 'lawkb-test-v2',
      status: 'active',
    });

    const rollbackResponse = await app.inject({
      method: 'POST',
      url: `/api/rollouts/${rolloutResponse.json<{ id: string }>().id}/rollback`,
    });
    expect(rollbackResponse.statusCode).toBe(200);
    expect(rollbackResponse.json()).toMatchObject({
      status: 'rolled_back',
      rolloutPercent: 0,
    });
  });
});
