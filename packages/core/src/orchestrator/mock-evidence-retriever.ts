import type {
  ComplianceKnowledgePort,
  KnowledgeQuery,
  KnowledgeResult,
} from '../ports/knowledge.js';

/** Handler used to configure mock evidence retrieval in tests. */
export type MockEvidenceHandler = (
  query: KnowledgeQuery,
) => KnowledgeResult[] | Promise<KnowledgeResult[]>;

/** In-memory evidence retriever that never accesses external systems. */
export class MockEvidenceRetriever implements ComplianceKnowledgePort {
  /** Queries received by this mock instance. */
  readonly queries: KnowledgeQuery[] = [];
  private readonly handler: MockEvidenceHandler;

  /** Creates a mock from fixed results or a query-aware handler. */
  constructor(results: KnowledgeResult[] | MockEvidenceHandler = []) {
    this.handler = typeof results === 'function' ? results : () => structuredClone(results);
  }

  /** Returns configured evidence and records the query for assertions. */
  async retrieve(query: KnowledgeQuery): Promise<KnowledgeResult[]> {
    this.queries.push(structuredClone(query));
    return this.handler(query);
  }
}
