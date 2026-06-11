import type {
  JobPosting,
  ReviewDecision,
  ReviewStatus,
  RiskCategory,
  RiskLevel,
} from '@job-compliance/shared';

export interface ReviewRequest {
  tenantId: string;
  jurisdiction: string;
  locale: string;
  platform: string;
  job: JobPosting;
}

export interface EvidenceReference {
  field: string;
  quote: string;
  start?: number;
  end?: number;
}

export interface ReviewFinding {
  id: string;
  ruleId?: string;
  evidenceId?: string;
  category: RiskCategory;
  riskLevel: RiskLevel;
  decision: ReviewDecision;
  message: string;
  evidence: EvidenceReference[];
}

export interface ReviewResult {
  id: string;
  tenantId: string;
  status: ReviewStatus;
  decision: ReviewDecision;
  riskLevel: RiskLevel;
  findings: ReviewFinding[];
  ruleVersion: string;
  lawKbVersion: string;
  createdAt: string;
}
