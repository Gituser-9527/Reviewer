import { describe, expect, it } from 'vitest';
import { decideRewriteSafety } from './rewrite-secondary-review.js';

const base = {
  protectedFactViolations: [],
  ungroundedFacts: [],
  criticalRiskRemaining: false,
  highRiskRemaining: false,
  newHighRisk: false,
  semantic: 'PASSED' as const,
  reflection: 'PASSED' as const,
  hallucinationDetected: false,
};

describe('rewrite secondary review', () => {
  it('only recommends when every check passes', () =>
    expect(decideRewriteSafety(base).decision).toBe('SAFE_TO_RECOMMEND'));
  it('does not treat unavailable semantic or reflection review as pass', () => {
    expect(decideRewriteSafety({ ...base, semantic: 'UNAVAILABLE' }).decision).toBe(
      'REQUIRES_HUMAN_REVIEW',
    );
    expect(decideRewriteSafety({ ...base, reflection: 'UNAVAILABLE' }).decision).toBe(
      'REQUIRES_HUMAN_REVIEW',
    );
  });
  it('rejects protected facts and hallucination despite complete coverage', () => {
    const coverage = {
      addressedFindingIds: ['f1'],
      unaddressedFindingIds: [],
      unknownFindingIds: [],
    };
    expect(
      decideRewriteSafety({
        ...base,
        protectedFactViolations: ['salary'],
        findingCoverage: coverage,
      }).decision,
    ).toBe('REJECTED');
    expect(
      decideRewriteSafety({ ...base, hallucinationDetected: true, findingCoverage: coverage })
        .decision,
    ).toBe('REJECTED');
  });
  it('rejects unaddressed or unknown persisted findings', () => {
    expect(
      decideRewriteSafety({
        ...base,
        findingCoverage: {
          addressedFindingIds: [],
          unaddressedFindingIds: ['f1'],
          unknownFindingIds: [],
        },
      }).decision,
    ).toBe('REJECTED');
    expect(
      decideRewriteSafety({
        ...base,
        findingCoverage: {
          addressedFindingIds: [],
          unaddressedFindingIds: [],
          unknownFindingIds: ['unknown'],
        },
      }).decision,
    ).toBe('REJECTED');
  });
  it('rejects critical or high residual findings and introduced rule risks', () => {
    const review = {
      status: 'COMPLETED' as const,
      ruleVersion: '1.0.0',
      rewrittenFindings: [],
      residualFindingKeys: ['rule|DISCRIMINATION|限女性'],
      introducedFindingKeys: [],
      hasCriticalOrHighFindings: true,
    };
    expect(decideRewriteSafety({ ...base, ruleEngineReview: review }).decision).toBe('REJECTED');
    expect(
      decideRewriteSafety({
        ...base,
        ruleEngineReview: {
          ...review,
          residualFindingKeys: [],
          introducedFindingKeys: ['rule|FEE_DEPOSIT|押金'],
          hasCriticalOrHighFindings: false,
        },
      }).decision,
    ).toBe('REJECTED');
  });
});
