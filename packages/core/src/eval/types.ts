import type { AuditDecision, JobPostingInput, RiskCategory } from '@job-compliance/shared';

export interface EvalCaseInput {
  id: string;
  datasetId?: string;
  source: string;
  jobInput?: JobPostingInput;
  title?: string;
  description: string;
  expectedDecision: AuditDecision;
  expectedCategories: RiskCategory[];
  expectedSeverity?: string;
  humanReason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface EvalFailureRecord {
  id: string;
  evalRunId: string;
  caseId: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  failureType: string;
  reason?: string;
  createdAt: string;
}

export interface EvalMetrics {
  decisionAccuracy: number;
  categoryPrecision: number;
  categoryRecall: number;
  criticalRecall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  manualReviewRate: number;
  evidenceAccuracy: number;
  rewriteSafetyRate: number;
}

export interface EvalRunReport extends EvalMetrics {
  id: string;
  datasetId: string;
  ruleVersion: string;
  lawKbVersion?: string;
  modelVersion?: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  failures: EvalFailureRecord[];
  createdAt: string;
}
