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

/** Enrichment explanation is intentionally constrained to existing audit findings. */
export const auditExplanationResultSchema = z.object({ auditRunId:z.string(), summary:z.string().max(4000), findings:z.array(z.object({findingId:z.string(),title:z.string(),explanation:z.string(),whyItMatters:z.string(),suggestedAction:z.string(),evidenceRefs:z.array(z.string())})).max(100), limitations:z.array(z.string()).max(20) }).strict();
export const jobPostingRewriteResultSchema = z.object({ title:z.string().optional(), description:z.string().min(1).max(20000), responsibilities:z.array(z.string()).optional(), requirements:z.array(z.string()).optional(), benefits:z.array(z.string()).optional(), changes:z.array(z.object({findingId:z.string(),originalText:z.string(),rewrittenText:z.string(),reason:z.string()})), preservedFacts:z.array(z.string()), warnings:z.array(z.string()) }).strict();
export type AuditExplanationResult=z.infer<typeof auditExplanationResultSchema>;
export type JobPostingRewriteResult=z.infer<typeof jobPostingRewriteResultSchema>;

