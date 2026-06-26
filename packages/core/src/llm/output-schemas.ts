import { z } from 'zod';

/** Schema for LLM-assisted risk explanations. */
export const llmRiskExplanationSchema = z
  .object({
    summary: z.string(),
    explanations: z.array(
      z.object({
        findingId: z.string(),
        explanation: z.string(),
        suggestion: z.string().optional(),
      }),
    ),
  })
  .strict();

/** Schema for LLM-assisted compliant rewrite drafts. */
export const llmRewriteSchema = z
  .object({
    rewrittenPosting: z.string(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

/** Schema for LLM-assisted reflection checks. */
export const llmReflectionSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        findingId: z.string().optional(),
      }),
    ),
  })
  .strict();

/** Schema for generic fact extraction drafts. Deterministic extraction remains authoritative. */
export const llmFactExtractionDraftSchema = z
  .object({
    jobTitle: z.string().optional(),
    companyName: z.string().optional(),
    employmentType: z.string().optional(),
    location: z.string().optional(),
    salaryText: z.string().optional(),
    responsibilities: z.array(z.string()).default([]),
    requirements: z.array(z.string()).default([]),
    benefits: z.array(z.string()).default([]),
    sensitiveConditions: z.array(z.string()).default([]),
    feesOrDeposit: z.array(z.string()).default([]),
    personalInfoRequests: z.array(z.string()).default([]),
    unclearClaims: z.array(z.string()).default([]),
  })
  .strict();

export type LLMRiskExplanation = z.infer<typeof llmRiskExplanationSchema>;
export type LLMRewrite = z.infer<typeof llmRewriteSchema>;
export type LLMReflection = z.infer<typeof llmReflectionSchema>;
export type LLMFactExtractionDraft = z.infer<typeof llmFactExtractionDraftSchema>;

