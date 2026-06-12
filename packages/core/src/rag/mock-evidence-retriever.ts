import type { Evidence } from '@job-compliance/shared';
import type { EvidenceRetrievalQuery, EvidenceRetriever } from './types.js';

/** Handler used to configure deterministic evidence retrieval in tests. */
export type MockEvidenceHandler =
  | Evidence[]
  | ((query: EvidenceRetrievalQuery) => Evidence[] | Promise<Evidence[]>);

/** In-memory retriever that records queries and never accesses external systems. */
export class MockEvidenceRetriever implements EvidenceRetriever {
  /** Queries received by this mock instance. */
  readonly queries: EvidenceRetrievalQuery[] = [];
  private readonly handler: (query: EvidenceRetrievalQuery) => Evidence[] | Promise<Evidence[]>;

  constructor(handler: MockEvidenceHandler = []) {
    this.handler = typeof handler === 'function' ? handler : () => structuredClone(handler);
  }

  async retrieve(query: EvidenceRetrievalQuery): Promise<Evidence[]> {
    this.queries.push(structuredClone(query));
    return structuredClone(await this.handler(query));
  }
}
