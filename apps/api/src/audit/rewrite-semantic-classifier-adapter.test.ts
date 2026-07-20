import { describe, expect, it } from 'vitest';
import { RewriteSemanticClassifierAdapter } from './rewrite-semantic-classifier-adapter.js';

const input = {
  context: {
    tenantId: 't',
    auditRunId: 'a',
    jurisdiction: 'CN_MAINLAND',
    ruleVersion: '1.0.0',
    decision: 'REVIEW',
    riskLevel: 'HIGH',
    language: 'zh-CN',
    originalJob: { description: '原文' },
    findings: [],
    evidence: [],
  },
  rewrite: { description: '改写', changes: [], preservedFacts: [], warnings: [] },
  findingCoverage: { addressedFindingIds: [], unaddressedFindingIds: [], unknownFindingIds: [] },
  rewriteSafety: {
    passed: true,
    decision: 'SAFE_TO_RECOMMEND' as const,
    protectedFactViolations: [],
    warnings: [],
  },
  ruleEngineReview: {
    status: 'COMPLETED' as const,
    ruleVersion: '1.0.0',
    rewrittenFindings: [],
    residualFindingKeys: [],
    introducedFindingKeys: [],
    hasCriticalOrHighFindings: false,
  },
};
describe('RewriteSemanticClassifierAdapter', () => {
  it('returns unavailable without a configured classifier and makes no call', async () =>
    await expect(new RewriteSemanticClassifierAdapter().review(input)).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      isMock: false,
    }));
  it.each(['PASSED', 'WARNING', 'FAILED'] as const)(
    'validates explicit test classifier %s',
    async (status) => {
      const adapter = new RewriteSemanticClassifierAdapter({
        classify: async () => ({
          status,
          reasonCodes: [],
          summary: 'reviewed',
          risks: [],
          originalRiskLikelyRemains: false,
          newRiskLikelyIntroduced: false,
          unsupportedFactsDetected: false,
          semanticDriftDetected: false,
        }),
      });
      await expect(adapter.review(input)).resolves.toMatchObject({ status, isMock: true });
    },
  );
  it('treats invalid configured output as a technical failure', async () => {
    const adapter = new RewriteSemanticClassifierAdapter({
      classify: async () => ({ status: 'PASSED' }),
    });
    await expect(adapter.review(input)).rejects.toThrow('SEMANTIC_CLASSIFIER_OUTPUT_INVALID');
  });
});
