import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected YYYY-MM-DD');

export const uatCheckStatusSchema = z.enum(['pass', 'warn', 'fail']);

export const generateUatReportSchema = z
  .object({
    currentVersion: nonEmptyText.max(100).optional(),
    generatedBy: nonEmptyText.max(200).optional(),
    checks: z
      .array(
        z
          .object({
            key: nonEmptyText.max(100),
            title: nonEmptyText.max(300).optional(),
            status: uatCheckStatusSchema.optional(),
            required: z.boolean().optional(),
            detail: z.string().trim().max(2_000).optional(),
            evidence: z.string().trim().max(2_000).optional(),
          })
          .strict(),
      )
      .default([]),
    metrics: z
      .object({
        evalAccuracy: z.number().min(0).max(1).optional(),
        decisionAccuracy: z.number().min(0).max(1).optional(),
        categoryRecall: z.number().min(0).max(1).optional(),
        redTeamRecall: z.number().min(0).max(1).optional(),
        p95LatencyMs: z.number().min(0).optional(),
        securityStatus: z.enum(['ready', 'needs_attention', 'blocked']).optional(),
        privacyStatus: z.enum(['ready', 'needs_attention', 'blocked']).optional(),
        rollbackDrillStatus: uatCheckStatusSchema.optional(),
        trainingReadinessRate: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    knownLimitations: z.array(z.string().trim().max(1_000)).optional(),
  })
  .strict();

export const uatReportParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const approveBetaFromUatSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    name: nonEmptyText.max(300).optional(),
    mode: z.enum(['shadow', 'assist', 'limited_enforce']).default('shadow'),
    startDate: dateText,
    endDate: dateText,
    ownerId: nonEmptyText.max(200).optional(),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be greater than or equal to startDate',
    path: ['endDate'],
  });
