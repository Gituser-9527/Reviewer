import { z } from 'zod';
import { auditJobSchema, auditOptionsSchema, companySchema } from '../audit/schemas.js';

const nonEmptyText = z.string().trim().min(1);

export const v1AuditJobSchema = z
  .object({
    externalId: nonEmptyText.max(200).optional(),
    tenantId: nonEmptyText.max(200).optional(),
    company: companySchema,
    job: auditJobSchema,
    options: auditOptionsSchema.optional(),
    sandbox: z.boolean().default(false),
  })
  .strict();

export const v1BatchJobSchema = z
  .object({
    externalId: nonEmptyText.max(200).optional(),
    company: companySchema,
    job: auditJobSchema,
    options: auditOptionsSchema.optional(),
  })
  .strict();

export const v1BatchAuditSchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
    jobs: z.array(v1BatchJobSchema).min(1).max(100).optional(),
    jsonl: z.string().trim().min(1).optional(),
    csv: z.string().trim().min(1).optional(),
    sandbox: z.boolean().default(false),
  })
  .strict()
  .refine((input) => input.jobs !== undefined || input.jsonl !== undefined || input.csv !== undefined, {
    message: 'jobs, jsonl or csv is required.',
  });

export const v1ParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

export const v1WebhookTestSchema = z
  .object({
    url: z.string().trim().url().or(z.string().trim().startsWith('mock://')).optional(),
    event: z.enum(['audit.completed', 'batch.completed']).default('audit.completed'),
    secret: z.string().trim().min(8).max(200).optional(),
  })
  .strict();

export const v1WebhookEndpointSchema = z
  .object({
    url: z.string().trim().url().or(z.string().trim().startsWith('mock://')),
    events: z.array(z.enum(['audit.completed', 'batch.completed'])).min(1).default(['audit.completed']),
    secret: z.string().trim().min(8).max(200).optional(),
  })
  .strict();

export const v1UsageQuerySchema = z
  .object({
    tenantId: nonEmptyText.max(200).optional(),
  })
  .strict();

export type V1AuditJobInput = z.infer<typeof v1AuditJobSchema>;
export type V1BatchAuditInput = z.infer<typeof v1BatchAuditSchema>;
export type V1BatchJobInput = z.infer<typeof v1BatchJobSchema>;
