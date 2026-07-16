import { z } from 'zod';
import type { JobPostingRewriteResult } from '@job-compliance/core';
import type { AuditEnrichmentContext } from './enrichment-context-loader.js';
import type { RewriteFindingCoverage } from './rewrite-finding-coverage.js';
import type { RewriteRuleEngineReview } from './rewrite-rule-engine-adapter.js';
import type { RewriteSafetyResult } from './rewrite-safety.js';

export const semanticReviewSchema = z
  .object({
    status: z.enum(['PASSED', 'WARNING', 'FAILED']),
    reasonCodes: z
      .array(
        z.enum([
          'SEMANTIC_RISK_REMAINS',
          'SEMANTIC_NEW_RISK',
          'UNSUPPORTED_FACT',
          'SEMANTIC_DRIFT',
          'CHANGE_MISMATCH',
        ]),
      )
      .max(20),
    summary: z.string().min(1).max(500),
    risks: z.array(z.string().max(200)).max(20),
    originalRiskLikelyRemains: z.boolean(),
    newRiskLikelyIntroduced: z.boolean(),
    unsupportedFactsDetected: z.boolean(),
    semanticDriftDetected: z.boolean(),
  })
  .strict();
export type SemanticReviewStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'UNAVAILABLE';
export interface SemanticReview {
  status: SemanticReviewStatus;
  reasonCodes: string[];
  summary: string;
  risks: string[];
  originalRiskLikelyRemains: boolean;
  newRiskLikelyIntroduced: boolean;
  unsupportedFactsDetected: boolean;
  semanticDriftDetected: boolean;
  isMock: boolean;
  provider?: string;
  model?: string;
  connectionId?: string;
}
export interface RewriteSemanticClassifier {
  classify(input: {
    context: AuditEnrichmentContext;
    rewrite: JobPostingRewriteResult;
    findingCoverage: RewriteFindingCoverage;
    rewriteSafety: RewriteSafetyResult;
    ruleEngineReview: RewriteRuleEngineReview;
  }): Promise<unknown>;
}

/** Production boundary: without an explicitly configured classifier, it completes as UNAVAILABLE and makes no provider call. */
export class RewriteSemanticClassifierAdapter {
  constructor(private readonly classifier?: RewriteSemanticClassifier) {}
  async review(input: {
    context: AuditEnrichmentContext;
    rewrite: JobPostingRewriteResult;
    findingCoverage: RewriteFindingCoverage;
    rewriteSafety: RewriteSafetyResult;
    ruleEngineReview: RewriteRuleEngineReview;
  }): Promise<SemanticReview> {
    if (!this.classifier)
      return {
        status: 'UNAVAILABLE',
        reasonCodes: ['SEMANTIC_CLASSIFIER_NOT_CONFIGURED'],
        summary: 'Semantic classifier is not configured for this deployment.',
        risks: [],
        originalRiskLikelyRemains: false,
        newRiskLikelyIntroduced: false,
        unsupportedFactsDetected: false,
        semanticDriftDetected: false,
        isMock: false,
      };
    const parsed = semanticReviewSchema.safeParse(await this.classifier.classify(input));
    if (!parsed.success) throw new Error('SEMANTIC_CLASSIFIER_OUTPUT_INVALID');
    const value = parsed.data;
    return {
      ...value,
      reasonCodes: [...new Set(value.reasonCodes)].sort(),
      risks: [...new Set(value.risks)].sort(),
      isMock: true,
    };
  }
}
