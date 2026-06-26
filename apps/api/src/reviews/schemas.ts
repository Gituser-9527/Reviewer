import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const feedbackTypes = [
  'FALSE_POSITIVE',
  'FALSE_NEGATIVE',
  'WRONG_CATEGORY',
  'WRONG_SEVERITY',
  'WRONG_EVIDENCE',
  'BAD_REWRITE',
  'RULE_TOO_BROAD',
  'RULE_TOO_NARROW',
  'NEEDS_NEW_RULE',
  'VALID_RESULT',
] as const;

const riskCategories = [
  'DISCRIMINATION',
  'FEE_DEPOSIT',
  'PRIVACY',
  'FALSE_OR_MISLEADING',
  'INCOMPLETE_INFORMATION',
  'LABOR_CONTRACT_RISK',
  'PLATFORM_POLICY',
  'OTHER',
] as const;

/** Query accepted by GET /api/reviews. */
export const reviewListQuerySchema = z
  .object({
    status: z.enum(['pending', 'completed', 'all']).default('pending'),
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

/** Route params accepted by review detail and decision routes. */
export const reviewParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

/** Body accepted by POST /api/reviews. */
export const createReviewBodySchema = z
  .object({
    auditRunId: nonEmptyText.max(200),
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

/** Body accepted by POST /api/reviews/:id/decision. */
export const submitReviewDecisionBodySchema = z
  .object({
    reviewerId: nonEmptyText.max(200).default('mock_reviewer'),
    finalDecision: z.enum(['APPROVE', 'REJECT', 'REQUEST_REVISION']),
    feedbackType: z.enum(feedbackTypes).default('VALID_RESULT'),
    comment: z.string().max(5_000).default(''),
    falsePositive: z.boolean().default(false),
    falseNegative: z.boolean().default(false),
  })
  .strict();

export type SubmitReviewDecisionBody = z.infer<typeof submitReviewDecisionBodySchema>;

export const addReviewToEvalBodySchema = z
  .object({
    datasetId: nonEmptyText.max(200).default('human_review_feedback'),
    source: nonEmptyText.max(100).default('human_review'),
    expectedDecision: z
      .enum(['PASS', 'REJECT', 'MANUAL_REVIEW', 'ALLOW_WITH_WARNING', 'NEED_MORE_INFO'])
      .optional(),
    expectedCategories: z.array(z.enum(riskCategories)).optional(),
    expectedSeverity: z.string().max(50).optional(),
    humanReason: z.string().max(5_000).optional(),
  })
  .strict()
  .default({
    datasetId: 'human_review_feedback',
    source: 'human_review',
  });

export const createRuleSuggestionBodySchema = z
  .object({
    createdBy: nonEmptyText.max(200).default('mock_reviewer'),
    feedbackType: z.enum(feedbackTypes).optional(),
    category: z.enum(riskCategories).optional(),
    ruleId: z.string().max(200).optional(),
    title: z.string().max(300).optional(),
    description: z.string().max(5_000).optional(),
  })
  .strict()
  .default({
    createdBy: 'mock_reviewer',
  });

export const ruleSuggestionListQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved', 'all']).default('open'),
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const ruleSuggestionParamsSchema = z
  .object({
    id: nonEmptyText.max(300),
  })
  .strict();

export const resolveRuleSuggestionBodySchema = z
  .object({
    resolvedBy: nonEmptyText.max(200).default('mock_rule_admin'),
    resolutionComment: z.string().max(5_000).optional(),
  })
  .strict();
