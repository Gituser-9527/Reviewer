import { z } from 'zod';
import { runtimeTargets, type RolloutStatus } from './services.js';

export const runtimeTargetSchema = z.enum(runtimeTargets);

export const runtimeConfigParamsSchema = z.object({
  key: runtimeTargetSchema,
});

export const updateRuntimeConfigSchema = z
  .object({
    stableVersion: z.string().trim().min(1).optional(),
    candidateVersion: z.string().trim().min(1).optional(),
    description: z.string().trim().max(1_000).optional(),
    updatedBy: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (input) =>
      input.stableVersion !== undefined ||
      input.candidateVersion !== undefined ||
      input.description !== undefined ||
      input.updatedBy !== undefined,
    { message: 'At least one runtime config field must be supplied.' },
  );

export const rolloutParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const rolloutStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'rolled_back',
] satisfies RolloutStatus[]);

export const createRolloutSchema = z.object({
  target: runtimeTargetSchema,
  stableVersion: z.string().trim().min(1),
  candidateVersion: z.string().trim().min(1),
  tenantAllowList: z.array(z.string().trim().min(1)).default([]),
  rolloutPercent: z.number().min(0).max(100).default(0),
  createdBy: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1_000).optional(),
});

export const updateRolloutSchema = z
  .object({
    tenantAllowList: z.array(z.string().trim().min(1)).optional(),
    rolloutPercent: z.number().min(0).max(100).optional(),
    status: rolloutStatusSchema.optional(),
    description: z.string().trim().max(1_000).optional(),
  })
  .refine(
    (input) =>
      input.tenantAllowList !== undefined ||
      input.rolloutPercent !== undefined ||
      input.status !== undefined ||
      input.description !== undefined,
    { message: 'At least one rollout field must be supplied.' },
  );
