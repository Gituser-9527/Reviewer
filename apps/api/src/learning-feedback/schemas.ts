import { z } from 'zod';

const text = z.string().trim();
const prohibitedKeys = ['rawText', 'html', 'fullHtml', 'capture', 'screenshot', 'resume', 'token', 'authorization', 'cookie', 'tenantId', 'reviewerId'] as const;

const base = z.object({
  source: z.enum(['WEB', 'EXTENSION', 'API']).default('WEB'),
  consentScope: z.enum(['NONE', 'TENANT_PRIVATE', 'GLOBAL_ANONYMIZED']),
  consentNoticeVersion: text.min(1).max(100),
  purpose: text.min(1).max(300),
  retentionDays: z.number().int().min(1).max(365),
  comment: z.string().max(2_000).default(''),
  evidenceFragments: z.array(z.string().max(500)).max(10).default([]),
}).strict();

export const learningFeedbackPreviewBodySchema = base.superRefine((value, ctx) => {
  if (value.comment.length + value.evidenceFragments.reduce((sum, item) => sum + item.length, 0) > 5_000) ctx.addIssue({ code: 'custom', message: 'Feedback text exceeds the total limit.' });
  if ([value.comment, ...value.evidenceFragments].some((entry) => /<\/?[A-Za-z][^>]*>/u.test(entry))) ctx.addIssue({ code: 'custom', message: 'HTML is not accepted in learning feedback.' });
  for (const key of prohibitedKeys) if (key in value) ctx.addIssue({ code: 'custom', message: `Unsupported field: ${key}` });
});
export const learningFeedbackSubmitBodySchema = learningFeedbackPreviewBodySchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/u), explicitConfirmation: z.literal(true) }).strict();
export const learningFeedbackListQuerySchema = z.object({ status: z.enum(['RECEIVED', 'NEEDS_REVIEW', 'PRIVACY_REJECTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PROMOTED_TO_GOLD_SET', 'all']).default('all') }).strict();
export const learningFeedbackParamsSchema = z.object({ id: text.min(1).max(200) }).strict();
export const learningFeedbackReviewBodySchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).strict();
