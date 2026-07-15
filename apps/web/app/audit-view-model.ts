import type {
  AuditDecision,
  AuditResult,
  Finding,
  RiskCategory,
  Severity,
} from '@job-compliance/shared';

export const decisionLabels: Record<AuditDecision, string> = {
  PASS: 'Pass',
  REJECT: 'Reject',
  MANUAL_REVIEW: 'Manual review',
  ALLOW_WITH_WARNING: 'Allow with warning',
  NEED_MORE_INFO: 'Need more info',
};

export const severityLabels: Record<Severity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const riskLevelLabels: Record<AuditResult['riskLevel'], string> = {
  NONE: 'No risk',
  LOW: 'Low risk',
  MEDIUM: 'Medium risk',
  HIGH: 'High risk',
  CRITICAL: 'Critical risk',
};

export const riskCategoryLabels: Record<RiskCategory, string> = {
  DISCRIMINATION: 'Discrimination',
  FEE_DEPOSIT: 'Fees and deposits',
  PRIVACY: 'Privacy',
  FALSE_OR_MISLEADING: 'False or misleading',
  INCOMPLETE_INFORMATION: 'Incomplete information',
  LABOR_CONTRACT_RISK: 'Labor contract risk',
  PLATFORM_POLICY: 'Platform policy',
  OTHER: 'Other',
};

const fallbackRiskScores: Record<AuditResult['riskLevel'], number> = {
  NONE: 0,
  LOW: 20,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 100,
};

type AuditResultWithOptionalScore = AuditResult & {
  riskScore?: number;
  risk_score?: number;
};

/** Returns an API-provided score when available, otherwise a documented level conversion. */
export function getRiskScore(result: AuditResult): { value: number; isEstimated: boolean } {
  const scoredResult = result as AuditResultWithOptionalScore;
  const providedScore = scoredResult.riskScore ?? scoredResult.risk_score;
  if (typeof providedScore === 'number' && Number.isFinite(providedScore)) {
    return { value: Math.max(0, Math.min(100, Math.round(providedScore))), isEstimated: false };
  }
  return { value: fallbackRiskScores[result.riskLevel], isEstimated: true };
}

/** Extracts unique source fragments from rule metadata and finding evidence. */
export function getMatchedTexts(finding: Finding): string[] {
  const metadataMatchedText = finding.metadata?.matchedText;
  const metadataTexts = Array.isArray(metadataMatchedText)
    ? metadataMatchedText.filter((item): item is string => typeof item === 'string')
    : typeof metadataMatchedText === 'string'
      ? [metadataMatchedText]
      : [];
  const evidenceTexts = finding.evidence.flatMap((item) =>
    item.quote === undefined ? [] : [item.quote],
  );
  return [...new Set([...metadataTexts, ...evidenceTexts])];
}
