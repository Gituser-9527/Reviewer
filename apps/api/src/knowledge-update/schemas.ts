import { z } from 'zod';

export const sourceTypes = ['LAW', 'POLICY', 'PLATFORM_RULE', 'CASE'] as const;

const nonEmptyText = z.string().trim().min(1);
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

export const createTrustedSourceSchema = z
  .object({
    name: nonEmptyText.max(300),
    sourceType: z.enum(sourceTypes),
    baseUrl: z.string().trim().url(),
    jurisdiction: nonEmptyText.max(100),
    scope: nonEmptyText.max(200),
  })
  .strict();

export const sourceParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const importLawKbDocumentSchema = z
  .object({
    sourceId: nonEmptyText.max(200),
    documentId: nonEmptyText.max(200).optional(),
    title: nonEmptyText.max(500),
    sourceUrl: z.string().trim().url(),
    sourceType: z.enum(sourceTypes),
    jurisdiction: nonEmptyText.max(100),
    scope: nonEmptyText.max(200),
    publishedAt: nonEmptyText.max(100),
    effectiveFrom: nonEmptyText.max(100),
    effectiveTo: z.string().trim().max(100).optional(),
    version: nonEmptyText.max(100),
    content: nonEmptyText.max(200_000),
    categories: z.array(z.enum(riskCategories)).min(1),
    keywords: z.array(nonEmptyText.max(100)).default([]),
    importedBy: nonEmptyText.max(200).default('law_kb_operator'),
  })
  .strict();

export const documentParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const documentDiffQuerySchema = z
  .object({
    version: nonEmptyText.max(100).optional(),
  })
  .strict();

export const createSuggestionSchema = z
  .object({
    documentVersionId: nonEmptyText.max(200),
  })
  .strict();

export const suggestionListQuerySchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  })
  .strict();

export const suggestionParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const approveSuggestionSchema = z
  .object({
    approvedBy: nonEmptyText.max(200).default('law_kb_reviewer'),
    lawKbVersion: nonEmptyText.max(100).optional(),
    datasetId: nonEmptyText.max(200).default('job-posting-cases'),
    runEval: z.boolean().default(true),
  })
  .strict();

export const versionParamsSchema = z
  .object({
    version: nonEmptyText.max(100),
  })
  .strict();

export const createLawKbRolloutSchema = z
  .object({
    stableVersion: nonEmptyText.max(100),
    tenantAllowList: z.array(nonEmptyText.max(200)).default([]),
    rolloutPercent: z.number().min(0).max(100).default(0),
    createdBy: nonEmptyText.max(200).default('law_kb_reviewer'),
  })
  .strict();

export type CreateTrustedSourceInput = z.infer<typeof createTrustedSourceSchema>;
export type ImportLawKbDocumentInput = z.infer<typeof importLawKbDocumentSchema>;
export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;
export type ApproveSuggestionInput = z.infer<typeof approveSuggestionSchema>;
export type CreateLawKbRolloutInput = z.infer<typeof createLawKbRolloutSchema>;
