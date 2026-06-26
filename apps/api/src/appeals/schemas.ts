import { z } from 'zod';

export const appealReasonTypes = [
  'MISTAKE',
  'JOB_SPECIALTY',
  'UPDATED_POSTING',
  'INACCURATE_EVIDENCE',
  'RULE_NOT_APPLICABLE',
  'OTHER',
] as const;

export const appealStatuses = ['submitted', 'under_review', 'agent_reported', 'resolved'] as const;

export const appealFinalDecisions = ['MAINTAIN', 'OVERTURN', 'REQUEST_REVISION'] as const;

export const appealListQuerySchema = z
  .object({
    status: z.enum([...appealStatuses, 'all']).default('submitted'),
    tenantId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const appealParamsSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
  })
  .strict();

export const createAppealSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(200),
    auditRunId: z.string().trim().min(1).max(200),
    submitterId: z.string().trim().min(1).max(200).default('enterprise_user'),
    reasonType: z.enum(appealReasonTypes),
    reasonText: z.string().trim().min(1).max(10_000),
    supplementalText: z.string().trim().max(20_000).optional(),
  })
  .strict();

export const addAppealMessageSchema = z
  .object({
    senderType: z.enum(['enterprise', 'reviewer', 'agent']).default('enterprise'),
    senderId: z.string().trim().min(1).max(200).default('enterprise_user'),
    message: z.string().trim().min(1).max(20_000),
    attachments: z.array(z.string().trim().min(1).max(500)).default([]),
  })
  .strict();

export const submitAppealReviewResultSchema = z
  .object({
    reviewerId: z.string().trim().min(1).max(200).default('mock_appeal_reviewer'),
    finalDecision: z.enum(appealFinalDecisions),
    comment: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const addAppealToEvalSchema = z
  .object({
    datasetId: z.string().trim().min(1).max(200).default('appeal_feedback'),
    source: z.string().trim().min(1).max(100).default('appeal_review'),
  })
  .strict()
  .default({
    datasetId: 'appeal_feedback',
    source: 'appeal_review',
  });

export const createAppealRuleSuggestionSchema = z
  .object({
    createdBy: z.string().trim().min(1).max(200).default('mock_appeal_reviewer'),
    title: z.string().trim().max(300).optional(),
    description: z.string().trim().max(10_000).optional(),
  })
  .strict()
  .default({
    createdBy: 'mock_appeal_reviewer',
  });

export type AppealReasonType = (typeof appealReasonTypes)[number];
export type AppealStatus = (typeof appealStatuses)[number];
export type AppealFinalDecision = (typeof appealFinalDecisions)[number];
export type CreateAppealInput = z.infer<typeof createAppealSchema>;
export type AddAppealMessageInput = z.infer<typeof addAppealMessageSchema>;
export type SubmitAppealReviewResultInput = z.infer<typeof submitAppealReviewResultSchema>;
