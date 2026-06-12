import type { Evidence, RiskCategory } from '@job-compliance/shared';

/** Input used to retrieve authority or policy evidence for one finding. */
export interface EvidenceRetrievalQuery {
  /** Risk category that the evidence must support. */
  category: RiskCategory;
  /** Rule explanation and matched text used for keyword scoring. */
  text: string;
  /** Explicit search keywords, usually including matched source fragments. */
  keywords: string[];
  /** Applicable jurisdiction code. */
  jurisdiction: string;
  /** Platform policy scope. */
  platform: string;
  /** Content locale. */
  locale: string;
  /** Audit timestamp used for future effective-date filtering. */
  asOf: string;
  /** Maximum number of results to return. */
  topK: number;
}

/** Port used by the audit orchestrator to obtain traceable supporting evidence. */
export interface EvidenceRetriever {
  /** Returns evidence ordered from most to least relevant. */
  retrieve(query: EvidenceRetrievalQuery): Promise<Evidence[]>;
}

/** Extension point for a future pgvector-backed evidence retriever. */
export abstract class VectorEvidenceRetriever implements EvidenceRetriever {
  /** Knowledge index version used by the vector implementation. */
  abstract readonly indexVersion: string;

  /** Retrieves evidence using vector or hybrid ranking. */
  abstract retrieve(query: EvidenceRetrievalQuery): Promise<Evidence[]>;
}
