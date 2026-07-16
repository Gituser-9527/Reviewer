import type { RewriteRuleEngineReview } from './rewrite-rule-engine-adapter.js';

export type ReviewStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'UNAVAILABLE';
export interface RewriteSafetyDecision {
  passed: boolean;
  decision: 'SAFE_TO_RECOMMEND' | 'REQUIRES_HUMAN_REVIEW' | 'REJECTED';
  warnings: string[];
}
export interface RewriteFindingCoverage {
  addressedFindingIds: readonly string[];
  unaddressedFindingIds: readonly string[];
  unknownFindingIds: readonly string[];
}
/** Deterministic aggregation used after rule, semantic and reflection review; never marks unavailable checks as passed. */
export function decideRewriteSafety(input: {
  protectedFactViolations: string[];
  ungroundedFacts: string[];
  criticalRiskRemaining: boolean;
  highRiskRemaining: boolean;
  newHighRisk: boolean;
  semantic: ReviewStatus;
  reflection: ReviewStatus;
  hallucinationDetected: boolean;
  findingCoverage?: RewriteFindingCoverage;
  ruleEngineReview?: RewriteRuleEngineReview;
}): RewriteSafetyDecision {
  const rejected =
    input.protectedFactViolations.length ||
    input.ungroundedFacts.length ||
    input.criticalRiskRemaining ||
    input.newHighRisk ||
    input.hallucinationDetected ||
    input.semantic === 'FAILED' ||
    input.reflection === 'FAILED' ||
    (input.findingCoverage?.unaddressedFindingIds.length ?? 0) > 0 ||
    (input.findingCoverage?.unknownFindingIds.length ?? 0) > 0 ||
    (input.ruleEngineReview?.hasCriticalOrHighFindings ?? false) ||
    (input.ruleEngineReview?.residualFindingKeys.length ?? 0) > 0 ||
    (input.ruleEngineReview?.introducedFindingKeys.length ?? 0) > 0;
  if (rejected)
    return { passed: false, decision: 'REJECTED', warnings: ['REWRITE_SECONDARY_REVIEW_FAILED'] };
  if (
    input.highRiskRemaining ||
    input.semantic === 'WARNING' ||
    input.semantic === 'UNAVAILABLE' ||
    input.reflection === 'WARNING' ||
    input.reflection === 'UNAVAILABLE'
  )
    return {
      passed: false,
      decision: 'REQUIRES_HUMAN_REVIEW',
      warnings: ['REWRITE_REQUIRES_HUMAN_REVIEW'],
    };
  return { passed: true, decision: 'SAFE_TO_RECOMMEND', warnings: [] };
}
