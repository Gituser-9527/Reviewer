import { z } from 'zod';
import type { JobPostingRewriteResult } from '@job-compliance/core';
import type { AuditEnrichmentContext } from './enrichment-context-loader.js';
import type { RewriteFindingCoverage } from './rewrite-finding-coverage.js';
import type { RewriteRuleEngineReview } from './rewrite-rule-engine-adapter.js';
import type { RewriteSafetyResult } from './rewrite-safety.js';
import type { SemanticReview } from './rewrite-semantic-classifier-adapter.js';

export const reflectionReviewSchema = z
  .object({
    status: z.enum(['PASSED', 'WARNING', 'FAILED']),
    reasonCodes: z
      .array(
        z.enum([
          'CHECK_CONFLICT',
          'RISK_OMISSION',
          'UNSUPPORTED_FACT',
          'SEMANTIC_DRIFT',
          'INSUFFICIENT_EVIDENCE',
        ]),
      )
      .max(20),
    summary: z.string().min(1).max(500),
    conflicts: z.array(z.string().max(200)).max(20),
    unresolvedIssues: z.array(z.string().max(200)).max(20),
    potentialRiskOmission: z.boolean(),
    checksConflict: z.boolean(),
    requiresHumanReview: z.boolean(),
  })
  .strict();
export type ReflectionReviewStatus = 'PASSED' | 'WARNING' | 'FAILED' | 'UNAVAILABLE';
export interface ReflectionReview {
  status: ReflectionReviewStatus;
  reasonCodes: string[];
  summary: string;
  conflicts: string[];
  unresolvedIssues: string[];
  potentialRiskOmission: boolean;
  checksConflict: boolean;
  requiresHumanReview: boolean;
  isMock: boolean;
  promptVersion?: string;
}
export interface RewriteReflection {
  reflect(input: {
    context: AuditEnrichmentContext;
    rewrite: JobPostingRewriteResult;
    findingCoverage: RewriteFindingCoverage;
    rewriteSafety: RewriteSafetyResult;
    ruleEngineReview: RewriteRuleEngineReview;
    semanticReview: SemanticReview;
  }): Promise<unknown>;
}
export class RewriteReflectionAdapter {
  constructor(private readonly reflection?: RewriteReflection) {}
  async review(input: {
    context: AuditEnrichmentContext;
    rewrite: JobPostingRewriteResult;
    findingCoverage: RewriteFindingCoverage;
    rewriteSafety: RewriteSafetyResult;
    ruleEngineReview: RewriteRuleEngineReview;
    semanticReview: SemanticReview;
  }): Promise<ReflectionReview> {
    if (!this.reflection)
      return {
        status: 'UNAVAILABLE',
        reasonCodes: ['REFLECTION_NOT_CONFIGURED'],
        summary: 'Rewrite reflection is not configured for this deployment.',
        conflicts: [],
        unresolvedIssues: [],
        potentialRiskOmission: false,
        checksConflict: false,
        requiresHumanReview: true,
        isMock: false,
      };
    const parsed = reflectionReviewSchema.safeParse(await this.reflection.reflect(input));
    if (!parsed.success) throw new Error('REFLECTION_OUTPUT_INVALID');
    const value = parsed.data;
    return {
      ...value,
      reasonCodes: [...new Set(value.reasonCodes)].sort(),
      conflicts: [...new Set(value.conflicts)].sort(),
      unresolvedIssues: [...new Set(value.unresolvedIssues)].sort(),
      isMock: true,
      promptVersion: 'reflection-check-v1',
    };
  }
}
