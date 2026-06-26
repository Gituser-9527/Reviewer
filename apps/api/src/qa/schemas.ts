import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

export const createQaInspectionJobSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    strategy: z.enum(['random', 'high_risk_first']).default('random'),
    sampleSize: z.number().int().min(1).max(500).default(20),
    ruleVersion: nonEmptyText.max(100).optional(),
    reviewerId: nonEmptyText.max(200).optional(),
    includeAppeals: z.boolean().default(true),
    includeRewrites: z.boolean().default(true),
    includeEvidence: z.boolean().default(true),
    createdBy: nonEmptyText.max(200).optional(),
  })
  .strict();

export const qaJobListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const qaJobParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const qaIssueListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    status: z.enum(['open', 'resolved', 'all']).default('open'),
  })
  .strict();

export const qaIssueParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const resolveQaIssueSchema = z
  .object({
    resolvedBy: nonEmptyText.max(200),
    resolutionComment: z.string().trim().max(2_000).optional(),
    addToEval: z.boolean().default(false),
    createRuleSuggestion: z.boolean().default(false),
    datasetId: nonEmptyText.max(200).default('qa_failed_samples'),
  })
  .strict();
