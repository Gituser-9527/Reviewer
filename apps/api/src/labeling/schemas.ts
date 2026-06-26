import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

export const reviewParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const disputedCaseParamsSchema = z
  .object({
    id: nonEmptyText.max(300),
  })
  .strict();

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

const severities = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

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

export const submitReviewerDecisionBodySchema = z
  .object({
    reviewerId: nonEmptyText.max(200),
    finalDecision: z.enum(['APPROVE', 'REJECT', 'REQUEST_REVISION']),
    categories: z.array(z.enum(riskCategories)).default([]),
    severity: z.enum(severities),
    feedbackType: z.enum(feedbackTypes).default('VALID_RESULT'),
    comment: z.string().max(5_000).default(''),
    confidence: z.number().min(0).max(1).default(1),
  })
  .strict();

export const disputedCaseListQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved', 'all']).default('open'),
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const resolveDisputedCaseBodySchema = z
  .object({
    resolvedBy: nonEmptyText.max(200),
    finalDecision: z.enum(['APPROVE', 'REJECT', 'REQUEST_REVISION']),
    finalCategories: z.array(z.enum(riskCategories)).default([]),
    finalSeverity: z.enum(severities),
    resolutionComment: z.string().max(5_000).default(''),
  })
  .strict();
