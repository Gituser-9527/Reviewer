import { describe, expect, it } from 'vitest';
import { parseEvalJsonl, runEvalDataset } from './index.js';

describe('real eval runner', () => {
  it('runs redacted JSONL cases and returns extended metrics', async () => {
    const cases = parseEvalJsonl(
      [
        JSON.stringify({
          id: 'eval_core_case_001',
          input: {
            title: '行政专员',
            description: '限女性，已婚已育优先，入职缴纳500元服装费，电话13812345678',
          },
          expected: {
            decision: 'REJECT',
            categories: ['DISCRIMINATION', 'FEE_DEPOSIT'],
            minRiskLevel: 'critical',
          },
        }),
        JSON.stringify({
          id: 'eval_core_case_002',
          input: {
            title: '后端工程师',
            description: '负责 Node.js 服务开发，参与系统设计和测试。',
          },
          expected: {
            decision: 'PASS',
            categories: [],
            minRiskLevel: 'none',
          },
        }),
      ].join('\n'),
      'dataset_core_test',
    );

    expect(cases[0]?.description).toContain('138****5678');

    const report = await runEvalDataset(cases, {
      datasetId: 'dataset_core_test',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      modelVersion: 'mock',
      now: () => new Date('2026-06-22T00:00:00.000Z'),
    });

    expect(report).toMatchObject({
      datasetId: 'dataset_core_test',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      modelVersion: 'mock',
      totalCases: 2,
    });
    expect(report.decisionAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.categoryPrecision).toBeGreaterThanOrEqual(0);
    expect(report.categoryRecall).toBeGreaterThanOrEqual(0);
    expect(report.criticalRecall).toBeGreaterThanOrEqual(0);
    expect(report.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(report.falseNegativeRate).toBeGreaterThanOrEqual(0);
    expect(report.manualReviewRate).toBeGreaterThanOrEqual(0);
    expect(report.evidenceAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.rewriteSafetyRate).toBeGreaterThanOrEqual(0);
    expect(report.failures.every((failure) => failure.expected && failure.actual)).toBe(true);
  });
});
