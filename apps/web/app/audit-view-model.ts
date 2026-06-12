import type {
  AuditDecision,
  AuditResult,
  Finding,
  RiskCategory,
  Severity,
} from '@job-compliance/shared';

export const decisionLabels: Record<AuditDecision, string> = {
  PASS: '通过',
  REJECT: '拦截',
  MANUAL_REVIEW: '人工复核',
  ALLOW_WITH_WARNING: '警告后允许',
  NEED_MORE_INFO: '需要补充信息',
};

export const severityLabels: Record<Severity, string> = {
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
  CRITICAL: '严重风险',
};

export const riskLevelLabels: Record<AuditResult['riskLevel'], string> = {
  NONE: '无风险',
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
  CRITICAL: '严重风险',
};

export const riskCategoryLabels: Record<RiskCategory, string> = {
  DISCRIMINATION: '就业歧视',
  FEE_DEPOSIT: '收费与押金',
  PRIVACY: '个人信息与隐私',
  FALSE_OR_MISLEADING: '虚假或误导信息',
  INCOMPLETE_INFORMATION: '信息不完整',
  LABOR_CONTRACT_RISK: '劳动合同风险',
  PLATFORM_POLICY: '平台规则',
  OTHER: '其他风险',
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
