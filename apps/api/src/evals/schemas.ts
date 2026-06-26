import { z } from 'zod';

const auditDecisions = [
  'PASS',
  'REJECT',
  'MANUAL_REVIEW',
  'ALLOW_WITH_WARNING',
  'NEED_MORE_INFO',
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

export const datasetParamsSchema = z.object({
  id: z.string().min(1),
});

export const runParamsSchema = z.object({
  id: z.string().min(1),
});

export const createDatasetBodySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
});

const evalCaseSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1).default('api'),
  title: z.string().optional(),
  description: z.string().min(1),
  expectedDecision: z.enum(auditDecisions),
  expectedCategories: z.array(z.enum(riskCategories)),
  expectedSeverity: z.string().optional(),
  humanReason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const addCasesBodySchema = z
  .object({
    cases: z.array(evalCaseSchema).optional(),
    jsonl: z.string().optional(),
    fromReviewTicketId: z.string().min(1).optional(),
    source: z.string().min(1).default('api'),
    title: z.string().optional(),
    description: z.string().optional(),
    expectedDecision: z.enum(auditDecisions).optional(),
    expectedCategories: z.array(z.enum(riskCategories)).optional(),
    expectedSeverity: z.string().optional(),
    humanReason: z.string().optional(),
  })
  .refine(
    (value) =>
      value.cases !== undefined ||
      value.jsonl !== undefined ||
      value.fromReviewTicketId !== undefined,
    { message: 'cases, jsonl, or fromReviewTicketId is required' },
  );

export const runEvalBodySchema = z.object({
  datasetId: z.string().min(1),
  ruleVersion: z.string().min(1).optional(),
  lawKbVersion: z.string().min(1).optional(),
  modelVersion: z.string().min(1).default('mock'),
  enableRealLlm: z.boolean().default(false),
});
