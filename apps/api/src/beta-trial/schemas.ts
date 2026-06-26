import { z } from 'zod';
import { betaTrialModes } from './service.js';

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

export const tenantModeParamsSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
  })
  .strict();

export const updateTenantModeBodySchema = z
  .object({
    mode: z.enum(betaTrialModes),
    enabled: z.boolean().default(true),
    updatedBy: nonEmptyText.max(200).default('mock_operator'),
  })
  .strict();

export const betaTrialRunParamsSchema = z
  .object({
    id: nonEmptyText.max(300),
  })
  .strict();

export const betaTrialRunListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    mode: z.enum(betaTrialModes).optional(),
    mismatchOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const betaTrialReportQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
    mode: z.enum(betaTrialModes).optional(),
  })
  .strict();

export const recordHumanResultBodySchema = z
  .object({
    auditRunId: nonEmptyText.max(300).optional(),
    reviewerId: nonEmptyText.max(200).default('mock_reviewer'),
    finalDecision: z.enum(['APPROVE', 'REJECT', 'REQUEST_REVISION']),
    feedbackType: z.enum(feedbackTypes).default('VALID_RESULT'),
    comment: z.string().max(5_000).optional(),
  })
  .strict();
