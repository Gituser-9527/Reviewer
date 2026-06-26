import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected YYYY-MM-DD');

export const betaProgramModeSchema = z.enum(['shadow', 'assist', 'limited_enforce']);
export const betaParticipantRoleSchema = z.enum(['reviewer', 'operator', 'compliance', 'observer']);
export const betaFeedbackTypeSchema = z.enum([
  'bug',
  'false_positive',
  'false_negative',
  'bad_evidence',
  'bad_rewrite',
  'ux_issue',
  'process_gap',
  'other',
]);
export const betaFeedbackStatusSchema = z.enum(['open', 'triaged', 'resolved']);
export const goNoGoStatusSchema = z.enum(['pending', 'pass', 'fail', 'waived']);

export const createBetaProgramSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    name: nonEmptyText.max(300),
    mode: betaProgramModeSchema.default('shadow'),
    startDate: dateText,
    endDate: dateText,
    scope: z.string().trim().max(2_000).optional(),
    goals: z.array(nonEmptyText.max(300)).default([]),
    ownerId: nonEmptyText.max(200).optional(),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be greater than or equal to startDate',
    path: ['endDate'],
  });

export const betaProgramListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const betaProgramParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const betaCheckParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
    checkId: nonEmptyText.max(200),
  })
  .strict();

export const updateBetaProgramModeSchema = z
  .object({
    mode: betaProgramModeSchema,
  })
  .strict();

export const addBetaParticipantSchema = z
  .object({
    userId: nonEmptyText.max(200),
    displayName: nonEmptyText.max(200),
    role: betaParticipantRoleSchema,
    email: z.string().trim().email().max(300).optional(),
  })
  .strict();

export const addBetaFeedbackSchema = z
  .object({
    reporterId: nonEmptyText.max(200),
    feedbackType: betaFeedbackTypeSchema,
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    title: nonEmptyText.max(300),
    description: nonEmptyText.max(5_000),
    relatedAuditRunId: z.string().trim().max(200).optional(),
  })
  .strict();

export const betaFeedbackListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    programId: nonEmptyText.max(200).optional(),
    status: z.enum(['open', 'triaged', 'resolved', 'all']).default('all'),
  })
  .strict();

export const createBetaDailyReportSchema = z
  .object({
    reportDate: dateText.optional(),
    auditsReviewed: z.number().int().min(0).default(0),
    manualReviewsCompleted: z.number().int().min(0).default(0),
    blockers: z.array(z.string().trim().max(1_000)).default([]),
    summary: z.string().trim().max(5_000).optional(),
    nextActions: z.array(z.string().trim().max(1_000)).default([]),
    createdBy: nonEmptyText.max(200).optional(),
  })
  .strict();

export const updateGoNoGoCheckSchema = z
  .object({
    status: goNoGoStatusSchema,
    evidence: z.string().trim().max(2_000).optional(),
  })
  .strict();
