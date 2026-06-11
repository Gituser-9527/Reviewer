import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

/** Zod schema for the company section of an audit request. */
export const companySchema = z
  .object({
    name: nonEmptyText.max(200),
  })
  .strict();

/** Zod schema for the job section of an audit request. */
export const auditJobSchema = z
  .object({
    title: nonEmptyText.max(200),
    description: nonEmptyText.max(50_000),
    location: nonEmptyText.max(500).optional(),
    salary: nonEmptyText.max(200).optional(),
    employmentType: nonEmptyText.max(100).optional(),
    responsibilities: z.array(nonEmptyText.max(2_000)).max(100).optional(),
    requirements: z.array(nonEmptyText.max(2_000)).max(100).optional(),
  })
  .strict();

/** Zod schema for runtime audit options. */
export const auditOptionsSchema = z
  .object({
    jurisdiction: z.enum(['CN_MAINLAND']).default('CN_MAINLAND'),
    enableRewrite: z.boolean().default(false),
    enableRag: z.boolean().default(false),
  })
  .strict()
  .default({
    jurisdiction: 'CN_MAINLAND',
    enableRewrite: false,
    enableRag: false,
  });

/** Request body accepted by POST /api/audit/job. */
export const auditJobRequestSchema = z
  .object({
    tenantId: nonEmptyText.max(200),
    jobPostingId: nonEmptyText.max(200),
    company: companySchema,
    job: auditJobSchema,
    options: auditOptionsSchema,
  })
  .strict();

/** Route parameters accepted by GET /api/audit/runs/:id. */
export const auditRunParamsSchema = z
  .object({
    id: nonEmptyText.max(200),
  })
  .strict();

/** Inferred API request body type. */
export type AuditJobRequest = z.infer<typeof auditJobRequestSchema>;
