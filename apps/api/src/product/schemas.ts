import { z } from 'zod';
import { auditJobSchema, auditOptionsSchema, companySchema } from '../audit/schemas.js';

const nonEmptyText = z.string().trim().min(1);

export const planIds = ['free_trial', 'starter', 'pro', 'enterprise'] as const;

export const createTenantSchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    tenantName: nonEmptyText.max(200),
    planId: z.enum(planIds).default('free_trial'),
    brandConfig: z
      .object({
        displayName: z.string().trim().max(200).optional(),
        logoUrl: z.string().trim().url().optional(),
        primaryColor: z.string().trim().max(50).optional(),
        supportEmail: z.string().trim().email().optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export const tenantParamsSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
  })
  .strict();

export const apiKeyParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const createApiKeySchema = z
  .object({
    name: nonEmptyText.max(200),
  })
  .strict();

export const updateBrandSchema = z
  .object({
    displayName: z.string().trim().max(200).optional(),
    logoUrl: z.string().trim().url().optional(),
    primaryColor: z.string().trim().max(50).optional(),
    supportEmail: z.string().trim().email().optional(),
  })
  .strict();

export const createWebhookSchema = z
  .object({
    url: z.string().trim().url().or(z.string().trim().startsWith('mock://')),
    events: z.array(z.enum(['audit.completed', 'batch.completed'])).min(1).default(['audit.completed']),
    secret: z.string().trim().min(8).max(200).optional(),
  })
  .strict();

export const batchAuditSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    jobs: z
      .array(
        z
          .object({
            jobPostingId: nonEmptyText.max(200),
            company: companySchema,
            job: auditJobSchema,
            options: auditOptionsSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const batchParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const exportAuditReportQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    format: z.enum(['csv', 'pdf']).default('csv'),
  })
  .strict();

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type BatchAuditInput = z.infer<typeof batchAuditSchema>;
export type BatchAuditJobInput = BatchAuditInput['jobs'][number];
