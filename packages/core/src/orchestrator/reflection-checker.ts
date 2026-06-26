import type {
  AuditDecision,
  AuditResult,
  Finding,
  RiskCategory,
  Severity,
} from '@job-compliance/shared';
import { RiskAggregator } from './risk-aggregator.js';

/** Optional context used by reflection checks that need source text. */
export interface ReflectionContext {
  /** Original or normalized job posting text used by the rule engine. */
  sourceText?: string;
}

/** Machine-readable issue found during the reflection pass. */
export interface ReflectionIssue {
  /** Stable issue code. */
  code:
    | 'HIGH_RISK_WITHOUT_TRACE'
    | 'MATCHED_TEXT_NOT_IN_SOURCE'
    | 'FINDING_DECISION_MISMATCH'
    | 'DECISION_MISMATCH'
    | 'RISK_LEVEL_MISMATCH'
    | 'CRITICAL_REQUIRES_REJECT'
    | 'HIGH_REQUIRES_MANUAL_REVIEW'
    | 'RAG_EVIDENCE_CATEGORY_MISMATCH'
    | 'REWRITE_CONTAINS_HIGH_RISK_TEXT'
    | 'INSUFFICIENT_EVIDENCE_REQUIRES_REVIEW'
    | 'ABSOLUTE_LEGAL_CONCLUSION'
    | 'INTERNAL_RULE_WEIGHT_LEAK';
  /** Human-readable consistency failure. */
  message: string;
  /** Finding associated with the issue, when applicable. */
  findingId?: string;
  /** Evidence associated with the issue, when applicable. */
  evidenceId?: string;
}

/** Result of the reflection pass. */
export interface ReflectionResult {
  /** Whether the result satisfies all basic consistency checks. */
  passed: boolean;
  /** Consistency issues found in the result. */
  issues: ReflectionIssue[];
  /** Safely corrected result when deterministic correction is possible. */
  correctedResult?: AuditResult;
}

/** Backward-compatible alias for earlier callers. */
export type ReflectionCheckResult = ReflectionResult;

/** Error raised when an audit result fails mandatory reflection checks. */
export class AuditReflectionError extends Error {
  /** Reflection issues that prevented the result from being returned. */
  readonly issues: ReflectionIssue[];

  constructor(issues: ReflectionIssue[]) {
    super(`Audit result failed reflection: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'AuditReflectionError';
    this.issues = issues;
  }
}

const highRiskLevels = new Set<Severity>(['HIGH', 'CRITICAL']);
const minimumDecisionRank: Record<AuditDecision, number> = {
  PASS: 0,
  ALLOW_WITH_WARNING: 1,
  NEED_MORE_INFO: 2,
  MANUAL_REVIEW: 3,
  REJECT: 4,
};
const findingDecisionBySeverity: Record<Severity, AuditDecision> = {
  LOW: 'ALLOW_WITH_WARNING',
  MEDIUM: 'ALLOW_WITH_WARNING',
  HIGH: 'MANUAL_REVIEW',
  CRITICAL: 'REJECT',
};
const highRiskRewritePattern =
  /限女性|只招女性|女性优先|限男性|只招男性|男性优先|已婚已育优先|无生育计划|保证金|押金|服装费|培训贷|入职费/iu;
const absoluteLegalConclusionPattern =
  /该企业已经违法|该企业构成犯罪|该岗位必然违法|该招聘行为已经构成法律责任/iu;
const internalRuleWeightPattern =
  /(?:内部)?规则权重|模型权重|weight\s*[:=]|threshold\s*[:=]|权重\s*[:=]|阈值\s*[:=]/iu;

function hasTrace(finding: Finding): boolean {
  return Boolean(finding.ruleId || finding.evidenceId);
}

function metadataMatchedText(finding: Finding): string[] {
  const value = finding.metadata?.matchedText;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

function metadataMatchedFieldPaths(finding: Finding): string[] {
  const value = finding.metadata?.matchedFieldPaths;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

function isSourceTextFieldPath(fieldPath: string): boolean {
  return (
    fieldPath === 'rawText' ||
    fieldPath === 'normalizedText' ||
    fieldPath === 'description' ||
    fieldPath === 'job.description'
  );
}

function shouldVerifyMatchedTextAgainstSource(finding: Finding): boolean {
  const fieldPaths = metadataMatchedFieldPaths(finding);
  return fieldPaths.length === 0 || fieldPaths.some(isSourceTextFieldPath);
}

function normalizeForSourceCheck(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(/[，。；、,.!?！？:：]/gu, '');
}

function sourceContains(sourceText: string, matchedText: string): boolean {
  if (sourceText.includes(matchedText)) return true;
  return normalizeForSourceCheck(sourceText).includes(normalizeForSourceCheck(matchedText));
}

function metadataCategories(value: unknown): RiskCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is RiskCategory => typeof entry === 'string',
  ) as RiskCategory[];
}

function evidenceCategories(finding: Finding, evidenceId: string): RiskCategory[] {
  const evidence = finding.evidence.find((entry) => entry.id === evidenceId);
  const categories = evidence?.metadata?.categories ?? evidence?.metadata?.category;
  if (typeof categories === 'string') return [categories as RiskCategory];
  return metadataCategories(categories);
}

function allUserFacingText(result: AuditResult): string[] {
  return [
    result.summary,
    ...result.suggestions,
    ...(result.compliantRewrite === null ? [] : [result.compliantRewrite]),
    ...result.findings.flatMap((finding) => [
      finding.title,
      finding.message,
      ...(finding.suggestion === undefined ? [] : [finding.suggestion]),
    ]),
  ];
}

function withCorrectedDecision(
  result: AuditResult,
  issues: readonly ReflectionIssue[],
): AuditResult | undefined {
  if (issues.length === 0) return undefined;
  const insufficientEvidence = issues.some(
    (issue) =>
      issue.code === 'HIGH_RISK_WITHOUT_TRACE' ||
      issue.code === 'INSUFFICIENT_EVIDENCE_REQUIRES_REVIEW',
  );
  if (insufficientEvidence && result.decision !== 'MANUAL_REVIEW') {
    return {
      ...result,
      decision: 'MANUAL_REVIEW',
      riskLevel: result.riskLevel === 'NONE' ? 'HIGH' : result.riskLevel,
      summary: `${result.summary} 当前高风险依据不足，建议转人工复核。`,
    };
  }
  return undefined;
}

/** Performs deterministic traceability and aggregation consistency checks. */
export class ReflectionChecker {
  constructor(private readonly riskAggregator: RiskAggregator = new RiskAggregator()) {}

  /** Checks an audit result without changing it. */
  check(result: AuditResult, context: ReflectionContext = {}): ReflectionResult {
    const issues: ReflectionIssue[] = [];

    for (const finding of result.findings) {
      if (highRiskLevels.has(finding.severity) && !hasTrace(finding)) {
        issues.push({
          code: 'HIGH_RISK_WITHOUT_TRACE',
          message: `High-risk finding ${finding.id} must include ruleId or evidenceId.`,
          findingId: finding.id,
        });
      }

      for (const matchedText of metadataMatchedText(finding)) {
        if (
          context.sourceText !== undefined &&
          shouldVerifyMatchedTextAgainstSource(finding) &&
          !sourceContains(context.sourceText, matchedText)
        ) {
          issues.push({
            code: 'MATCHED_TEXT_NOT_IN_SOURCE',
            message: `Matched text for finding ${finding.id} was not found in source text.`,
            findingId: finding.id,
          });
        }
      }

      const expectedFindingDecision = findingDecisionBySeverity[finding.severity];
      if (minimumDecisionRank[finding.decision] < minimumDecisionRank[expectedFindingDecision]) {
        issues.push({
          code: 'FINDING_DECISION_MISMATCH',
          message: `Finding ${finding.id} with severity ${finding.severity} requires at least ${expectedFindingDecision}.`,
          findingId: finding.id,
        });
      }

      if (highRiskLevels.has(finding.severity) && !hasTrace(finding)) {
        issues.push({
          code: 'INSUFFICIENT_EVIDENCE_REQUIRES_REVIEW',
          message: `Finding ${finding.id} has insufficient traceable evidence and should be downgraded to manual review.`,
          findingId: finding.id,
        });
      }

      for (const evidenceId of finding.evidenceIds) {
        const categories = evidenceCategories(finding, evidenceId);
        if (categories.length > 0 && !categories.includes(finding.category)) {
          issues.push({
            code: 'RAG_EVIDENCE_CATEGORY_MISMATCH',
            message: `Evidence ${evidenceId} does not support finding category ${finding.category}.`,
            findingId: finding.id,
            evidenceId,
          });
        }
      }
    }

    const expected = this.riskAggregator.aggregate(result.findings);
    if (expected.decision !== result.decision) {
      issues.push({
        code: 'DECISION_MISMATCH',
        message: `Expected decision ${expected.decision}, received ${result.decision}.`,
      });
    }
    if (expected.riskLevel !== result.riskLevel) {
      issues.push({
        code: 'RISK_LEVEL_MISMATCH',
        message: `Expected risk level ${expected.riskLevel}, received ${result.riskLevel}.`,
      });
    }

    if (result.riskLevel === 'CRITICAL' && result.decision !== 'REJECT') {
      issues.push({
        code: 'CRITICAL_REQUIRES_REJECT',
        message: 'Critical risk must result in REJECT when traceable evidence is sufficient.',
      });
    }

    if (
      result.riskLevel === 'HIGH' &&
      minimumDecisionRank[result.decision] < minimumDecisionRank.MANUAL_REVIEW
    ) {
      issues.push({
        code: 'HIGH_REQUIRES_MANUAL_REVIEW',
        message: 'High risk must at least result in MANUAL_REVIEW.',
      });
    }

    if (result.compliantRewrite !== null && highRiskRewritePattern.test(result.compliantRewrite)) {
      issues.push({
        code: 'REWRITE_CONTAINS_HIGH_RISK_TEXT',
        message: 'Compliant rewrite still contains high-risk hiring language.',
      });
    }

    for (const text of allUserFacingText(result)) {
      if (absoluteLegalConclusionPattern.test(text)) {
        issues.push({
          code: 'ABSOLUTE_LEGAL_CONCLUSION',
          message: 'Audit output contains an absolute legal conclusion.',
        });
        break;
      }
    }

    for (const text of allUserFacingText(result)) {
      if (internalRuleWeightPattern.test(text)) {
        issues.push({
          code: 'INTERNAL_RULE_WEIGHT_LEAK',
          message: 'Audit output appears to expose internal rule weights or thresholds.',
        });
        break;
      }
    }

    const correctedResult = withCorrectedDecision(result, issues);
    return {
      passed: issues.length === 0,
      issues,
      ...(correctedResult === undefined ? {} : { correctedResult }),
    };
  }

  /** Throws when an audit result fails a mandatory reflection check. */
  assertValid(result: AuditResult, context: ReflectionContext = {}): void {
    const check = this.check(result, context);
    if (!check.passed) throw new AuditReflectionError(check.issues);
  }
}
