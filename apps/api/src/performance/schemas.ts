import { z } from 'zod';
import { batchAuditSchema, batchParamsSchema } from '../product/schemas.js';

const nonEmptyText = z.string().trim().min(1);

export { batchAuditSchema, batchParamsSchema };

export const usageQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    apiKeyId: nonEmptyText.max(200).optional(),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  })
  .strict();

export const tenantLimitParamsSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
  })
  .strict();

export const updateTenantLimitsSchema = z
  .object({
    tenantDailyAuditLimit: z.number().int().min(1).optional(),
    tenantPerMinuteLimit: z.number().int().min(1).optional(),
    apiKeyPerMinuteLimit: z.number().int().min(1).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.tenantDailyAuditLimit !== undefined ||
      input.tenantPerMinuteLimit !== undefined ||
      input.apiKeyPerMinuteLimit !== undefined,
    { message: 'At least one limit value must be supplied.' },
  );
