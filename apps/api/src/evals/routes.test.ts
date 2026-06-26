import { afterEach, describe, expect, it } from 'vitest';
import type { EvalRunReport } from '@job-compliance/core';
import { buildApp } from '../app.js';

const apps = [] as ReturnType<typeof buildApp>[];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('eval API routes', () => {
  it('creates a dataset, imports JSONL cases, runs eval, and lists failures', async () => {
    const app = buildApp();
    apps.push(app);

    const datasetResponse = await app.inject({
      method: 'POST',
      url: '/api/evals/datasets',
      payload: {
        id: 'dataset_api_test',
        name: 'API Eval Dataset',
        version: '2026-06-22',
      },
    });
    expect(datasetResponse.statusCode).toBe(201);
    expect(datasetResponse.json()).toMatchObject({
      id: 'dataset_api_test',
      name: 'API Eval Dataset',
    });

    const jsonl = [
      JSON.stringify({
        id: 'eval_api_case_001',
        input: {
          title: '行政专员',
          description: '限女性，已婚已育优先，入职缴纳500元服装费',
        },
        expected: {
          decision: 'REJECT',
          categories: ['DISCRIMINATION', 'FEE_DEPOSIT'],
          minRiskLevel: 'critical',
        },
      }),
      JSON.stringify({
        id: 'eval_api_case_002',
        input: {
          title: '前端工程师',
          description: '负责 React 应用开发，要求熟悉 TypeScript，五险一金。',
        },
        expected: {
          decision: 'PASS',
          categories: [],
          minRiskLevel: 'none',
        },
      }),
    ].join('\n');

    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/evals/datasets/dataset_api_test/cases',
      payload: { jsonl },
    });
    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.json()).toMatchObject({ imported: 2 });

    const listCasesResponse = await app.inject({
      method: 'GET',
      url: '/api/evals/datasets/dataset_api_test/cases',
    });
    expect(listCasesResponse.statusCode).toBe(200);
    expect(listCasesResponse.json<{ items: unknown[] }>().items).toHaveLength(2);

    const runResponse = await app.inject({
      method: 'POST',
      url: '/api/evals/run',
      payload: {
        datasetId: 'dataset_api_test',
        ruleVersion: '1.0.0',
        lawKbVersion: 'local-test',
      },
    });
    const report = runResponse.json<EvalRunReport>();
    expect(runResponse.statusCode).toBe(201);
    expect(report).toMatchObject({
      datasetId: 'dataset_api_test',
      totalCases: 2,
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      modelVersion: 'mock',
    });
    expect(typeof report.decisionAccuracy).toBe('number');
    expect(typeof report.categoryPrecision).toBe('number');
    expect(typeof report.criticalRecall).toBe('number');

    const getRunResponse = await app.inject({
      method: 'GET',
      url: `/api/evals/runs/${report.id}`,
    });
    expect(getRunResponse.statusCode).toBe(200);
    expect(getRunResponse.json()).toEqual(report);

    const failuresResponse = await app.inject({
      method: 'GET',
      url: `/api/evals/runs/${report.id}/failures`,
    });
    expect(failuresResponse.statusCode).toBe(200);
    expect(failuresResponse.json()).toMatchObject({
      items: report.failures,
    });
  });
});
