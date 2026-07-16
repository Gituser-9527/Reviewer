import { describe, expect, it } from 'vitest';
import { RewriteReflectionAdapter } from './rewrite-reflection-adapter.js';
const input = {
  context: {
    tenantId: 't',
    auditRunId: 'a',
    jurisdiction: 'CN_MAINLAND',
    ruleVersion: '1',
    decision: 'REVIEW',
    riskLevel: 'HIGH',
    language: 'zh-CN',
    originalJob: { description: 'x' },
    findings: [],
    evidence: [],
  },
  rewrite: { description: 'y', changes: [], preservedFacts: [], warnings: [] },
  findingCoverage: { addressedFindingIds: [], unaddressedFindingIds: [], unknownFindingIds: [] },
  rewriteSafety: {
    passed: true,
    decision: 'SAFE_TO_RECOMMEND' as const,
    protectedFactViolations: [],
    warnings: [],
  },
  ruleEngineReview: {
    status: 'COMPLETED' as const,
    ruleVersion: '1',
    rewrittenFindings: [],
    residualFindingKeys: [],
    introducedFindingKeys: [],
    hasCriticalOrHighFindings: false,
  },
  semanticReview: {
    status: 'UNAVAILABLE' as const,
    reasonCodes: [],
    summary: 'none',
    risks: [],
    originalRiskLikelyRemains: false,
    newRiskLikelyIntroduced: false,
    unsupportedFactsDetected: false,
    semanticDriftDetected: false,
    isMock: false,
  },
};
describe('RewriteReflectionAdapter', () => {
  it('returns unavailable without configured reflection', async () =>
    await expect(new RewriteReflectionAdapter().review(input)).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      isMock: false,
    }));
  it.each(['PASSED', 'WARNING', 'FAILED'] as const)(
    'validates explicit reflection %s',
    async (status) => {
      const adapter = new RewriteReflectionAdapter({
        reflect: async () => ({
          status,
          reasonCodes: [],
          summary: 'reviewed',
          conflicts: [],
          unresolvedIssues: [],
          potentialRiskOmission: false,
          checksConflict: false,
          requiresHumanReview: false,
        }),
      });
      await expect(adapter.review(input)).resolves.toMatchObject({ status, isMock: true });
    },
  );
  it('throws for invalid configured output', async () =>
    await expect(
      new RewriteReflectionAdapter({ reflect: async () => ({ status: 'PASSED' }) }).review(input),
    ).rejects.toThrow('REFLECTION_OUTPUT_INVALID'));
});
