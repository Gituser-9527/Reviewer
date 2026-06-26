import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected YYYY-MM-DD');
const pilotModes = ['shadow_mode', 'assist_mode', 'enforce_mode'] as const;

export const createPilotProjectSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    name: nonEmptyText.max(300),
    startDate: dateText,
    endDate: dateText,
    modes: z.array(z.enum(pilotModes)).min(1).default(['shadow_mode', 'assist_mode']),
    avgReviewTimeBefore: z.number().min(0).max(240).default(6),
    avgReviewTimeAfter: z.number().min(0).max(240).default(2),
    hourlyLaborCost: z.number().min(0).max(100_000).default(80),
    description: z.string().trim().max(2_000).optional(),
    createdBy: nonEmptyText.max(200).optional(),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be greater than or equal to startDate',
    path: ['endDate'],
  });

export const pilotListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const pilotParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const addCustomerFeedbackSchema = z
  .object({
    feedbackType: z
      .enum(['satisfaction', 'risk', 'feature_request', 'bug', 'other'])
      .default('satisfaction'),
    rating: z.number().min(1).max(5).optional(),
    contactName: z.string().trim().max(200).optional(),
    comment: nonEmptyText.max(5_000),
  })
  .strict();

export const feedbackListQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    pilotProjectId: nonEmptyText.max(200).optional(),
  })
  .strict();

export const exportReportQuerySchema = z
  .object({
    format: z.enum(['markdown', 'pdf']).default('markdown'),
  })
  .strict();
