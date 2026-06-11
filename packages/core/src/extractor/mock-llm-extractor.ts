import { jobFactsSchema, type JobFacts } from '@job-compliance/shared';
import type { ExtractionInput, LLMExtractionOptions, LLMExtractor } from './types.js';

/** Function used by MockLLMExtractor to generate test facts. */
export type MockLLMExtractionHandler = (
  input: ExtractionInput,
  options?: LLMExtractionOptions,
) => JobFacts | Promise<JobFacts>;

/** In-memory LLM extractor replacement that never calls an external model. */
export class MockLLMExtractor implements LLMExtractor {
  private readonly handler: MockLLMExtractionHandler;

  /** Creates a mock from fixed facts or a custom test handler. */
  constructor(result: JobFacts | MockLLMExtractionHandler) {
    this.handler = typeof result === 'function' ? result : () => structuredClone(result);
  }

  /** Returns schema-validated mock facts. */
  async extract(input: ExtractionInput, options?: LLMExtractionOptions): Promise<JobFacts> {
    const facts = await this.handler(input, options);
    return jobFactsSchema.parse(facts);
  }
}
