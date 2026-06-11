import type { JobFacts, JobPostingInput } from '@job-compliance/shared';

/** Input accepted by a job-facts extractor. */
export interface ExtractionInput {
  /** Complete original job posting text. */
  rawText: string;
  /** Optional structured fields supplied by the caller. */
  structuredInput?: Partial<JobPostingInput>;
}

/** Common interface implemented by deterministic and model-backed extractors. */
export interface JobFactsExtractor {
  /** Extracts source-preserving job facts without making compliance decisions. */
  extract(input: ExtractionInput): Promise<JobFacts>;
}

/** Options reserved for a future LLM-backed extractor implementation. */
export interface LLMExtractionOptions {
  /** Locale used to interpret the source text. */
  locale?: string;
  /** Jurisdiction used to select extraction terminology. */
  jurisdiction?: string;
  /** Prompt version recorded for traceability. */
  promptVersion?: string;
}

/** Provider-independent contract for future model-backed fact extraction. */
export interface LLMExtractor extends JobFactsExtractor {
  /** Extracts facts with optional model-execution context. */
  extract(input: ExtractionInput, options?: LLMExtractionOptions): Promise<JobFacts>;
}
