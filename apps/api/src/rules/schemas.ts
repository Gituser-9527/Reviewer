import { z } from 'zod';

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

const severities = ['low', 'medium', 'high', 'critical'] as const;
const actions = [
  'pass',
  'reject',
  'manual_review',
  'allow_with_warning',
  'need_more_info',
] as const;
const ruleLifecycleStatuses = ['draft', 'testing', 'published', 'disabled', 'archived'] as const;

const matcherSchema = z
  .object({
    fields: z.array(z.string().min(1)).default(['rawText', 'normalizedText']),
    values: z.array(z.string().min(1)).optional(),
    patterns: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => value.values !== undefined || value.patterns !== undefined, {
    message: 'matcher must include values or patterns',
  });

export const ruleStatusSchema = z.enum(['draft', 'published', 'all']).default('draft');

export const ruleListQuerySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  status: ruleStatusSchema,
});

export const ruleParamsSchema = z.object({
  id: z.string().min(1),
});

export const managedRuleInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    category: z.enum(riskCategories),
    severity: z.enum(severities),
    action: z.enum(actions),
    containsAny: matcherSchema.optional(),
    regex: matcherSchema.optional(),
    patterns: z.array(z.string().min(1)).optional(),
    fields: z.array(z.string().min(1)).optional(),
    explanation: z.string().min(1),
    suggestion: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
  })
  .refine(
    (value) =>
      value.containsAny !== undefined || value.regex !== undefined || value.patterns !== undefined,
    {
      message: 'rule must define containsAny, regex, or patterns',
    },
  );

export const createRuleBodySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  fileName: z.string().min(1).optional(),
  rule: managedRuleInputSchema,
});

export const updateRuleBodySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  rule: managedRuleInputSchema,
});

export const toggleRuleBodySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  enabled: z.boolean(),
});

export const publishRulesBodySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  ruleVersion: z.string().min(1).optional(),
  actorId: z.string().min(1).default('mock-rule-admin'),
});

export const ruleVersionsQuerySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
});

export const createRuleSetBodySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  description: z.string().optional(),
});

export const ruleSetParamsSchema = z.object({
  id: z.string().min(1),
});

export const addRuleToRuleSetBodySchema = z.object({
  fileName: z.string().min(1).optional(),
  rule: managedRuleInputSchema,
});

export const patchRuleBodySchema = z.object({
  jurisdiction: z.string().min(1).default('CN_MAINLAND'),
  id: z.string().min(1).optional(),
  category: z.enum(riskCategories).optional(),
  severity: z.enum(severities).optional(),
  action: z.enum(actions).optional(),
  containsAny: matcherSchema.optional(),
  regex: matcherSchema.optional(),
  patterns: z.array(z.string().min(1)).optional(),
  fields: z.array(z.string().min(1)).optional(),
  explanation: z.string().min(1).optional(),
  suggestion: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const testRuleSetBodySchema = z.object({
  text: z.string().min(1),
  ruleVersion: z.string().min(1).optional(),
});

export const runEvalRuleSetBodySchema = z.object({
  ruleVersion: z.string().min(1).optional(),
});

export const publishRuleSetBodySchema = z.object({
  ruleVersion: z.string().min(1).optional(),
  actorId: z.string().min(1).default('mock-rule-admin'),
  forcePublish: z.boolean().default(false),
  minDecisionAccuracy: z.number().min(0).max(1).default(0.9),
  minCategoryRecall: z.number().min(0).max(1).default(0.9),
});

export const rollbackRuleSetBodySchema = z.object({
  actorId: z.string().min(1).default('mock-rule-admin'),
  targetVersion: z.string().min(1).optional(),
});

export const publishRecordQuerySchema = z.object({
  status: z.enum(ruleLifecycleStatuses).optional(),
});

export type ManagedRuleInput = z.infer<typeof managedRuleInputSchema>;
export type RuleStatus = z.infer<typeof ruleStatusSchema>;
