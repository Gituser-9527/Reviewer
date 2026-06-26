import { z } from 'zod';
import { releaseTargets } from './service.js';

export const releaseCandidateParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const releaseQualityMetricsSchema = z
  .object({
    criticalRecall: z.number().min(0).max(1).optional(),
    falseNegativeRate: z.number().min(0).max(1).optional(),
    falsePositiveRate: z.number().min(0).max(1).optional(),
    evidenceAccuracy: z.number().min(0).max(1).optional(),
    rewriteSafetyRate: z.number().min(0).max(1).optional(),
    redTeamRecall: z.number().min(0).max(1).optional(),
    predictedRejectRateChange: z.number().min(0).max(1).optional(),
  })
  .optional();

export const createReleaseCandidateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    target: z.enum(releaseTargets),
    ruleVersion: z.string().trim().min(1).max(100).optional(),
    lawKbVersion: z.string().trim().min(1).max(100).optional(),
    modelVersion: z.string().trim().min(1).max(100).optional(),
    promptVersion: z.string().trim().min(1).max(100).optional(),
    evalDatasetId: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1_000).optional(),
    createdBy: z.string().trim().min(1).max(200).optional(),
    qualityMetrics: releaseQualityMetricsSchema,
  })
  .refine((input) => input[input.target] !== undefined, {
    message: 'Target version field is required.',
  });

export const approveReleaseCandidateBodySchema = z.object({
  approvedBy: z.string().trim().min(1).max(200).optional(),
  comment: z.string().trim().max(1_000).optional(),
});

export const publishReleaseCandidateBodySchema = z.object({
  forcePublish: z.boolean().default(false),
});
