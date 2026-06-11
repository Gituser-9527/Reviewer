export interface KnowledgeQuery {
  text: string;
  jurisdiction: string;
  platform: string;
  locale: string;
  asOf: string;
  topK: number;
}

export interface KnowledgeResult {
  evidenceId: string;
  sourceType: string;
  sourceName: string;
  sourceVersion: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  retrievedAt: string;
  content: string;
  score: number;
}

export interface ComplianceKnowledgePort {
  retrieve(query: KnowledgeQuery): Promise<KnowledgeResult[]>;
}
