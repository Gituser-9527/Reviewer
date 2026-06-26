import { z } from 'zod';

export const retentionResourceTypes = [
  'audit_runs',
  'audit_operation_logs',
  'llm_call_logs',
  'eval_cases',
] as const;

export const deletionTargetTypes = ['tenant', 'audit_run'] as const;

export const configureRetentionSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(200).optional(),
    resourceType: z.enum(retentionResourceTypes),
    retentionDays: z.number().int().min(1).max(3650),
    enabled: z.boolean().default(true),
  })
  .strict();

export const createDeletionRequestSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(200),
    targetType: z.enum(deletionTargetTypes),
    targetId: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export const deletionRequestParamsSchema = z
  .object({
    id: z.string().trim().min(1),
  })
  .strict();

export const createPrivacyExportRequestSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(200),
  })
  .strict();

export const tenantQuerySchema = z
  .object({
    tenantId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type ConfigureRetentionRequest = z.infer<typeof configureRetentionSchema>;
export type CreateDeletionRequest = z.infer<typeof createDeletionRequestSchema>;
export type CreatePrivacyExportRequest = z.infer<typeof createPrivacyExportRequestSchema>;
