import type { JobPosting } from '@job-compliance/shared';
import type { ReviewFinding } from '../review/types.js';

export interface LlmAnalysisResult {
  findings: ReviewFinding[];
  providerRequestId?: string;
}

export interface LlmRewriteResult {
  text: string;
}

export interface LlmProvider {
  analyzeJob(job: JobPosting): Promise<LlmAnalysisResult>;
  rewriteJob(job: JobPosting, findings: ReviewFinding[]): Promise<LlmRewriteResult>;
  healthCheck(): Promise<boolean>;
}
