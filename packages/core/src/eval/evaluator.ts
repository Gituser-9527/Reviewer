import type { AuditResult, JobPostingInput, RiskCategory } from '@job-compliance/shared';
import { auditJobPosting, type AuditOrchestratorOptions } from '../orchestrator/index.js';
import type { EvalCaseInput, EvalFailureRecord, EvalRunReport } from './types.js';

const criticalSeverityValues = new Set(['CRITICAL', 'critical']);
const highRiskRewritePattern =
  /限女性|只招女性|女性优先|限男性|只招男性|男性优先|已婚已育优先|无生育计划|保证金|押金|服装费|培训贷|入职费/iu;

export interface RunEvalDatasetOptions extends AuditOrchestratorOptions {
  datasetId: string;
  evalRunId?: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion?: string;
  now?: () => Date;
}

interface CaseEvaluation {
  entry: EvalCaseInput;
  result: AuditResult;
  reasons: string[];
  failureTypes: string[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function ratio(numerator: number, denominator: number, emptyValue = 1): number {
  return denominator === 0 ? emptyValue : numerator / denominator;
}

function riskMeetsExpected(actualRiskLevel: string, expectedSeverity?: string): boolean {
  if (expectedSeverity === undefined) return true;
  const rank: Record<string, number> = {
    NONE: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };
  return (rank[actualRiskLevel.toUpperCase()] ?? 0) >= (rank[expectedSeverity.toUpperCase()] ?? 0);
}

function hasEvidence(result: AuditResult): boolean {
  if (result.decision === 'PASS') return true;
  return (
    result.evidence.length > 0 && result.findings.every((finding) => finding.evidenceIds.length > 0)
  );
}

function rewriteIsSafe(result: AuditResult): boolean {
  return result.compliantRewrite === null || !highRiskRewritePattern.test(result.compliantRewrite);
}

function actualCategories(result: AuditResult): string[] {
  return uniqueSorted(result.findings.map((finding) => finding.category));
}

function evaluateCase(entry: EvalCaseInput, result: AuditResult): CaseEvaluation {
  const expectedCategories = uniqueSorted(entry.expectedCategories);
  const categories = actualCategories(result);
  const reasons: string[] = [];
  const failureTypes: string[] = [];

  if (result.decision !== entry.expectedDecision) {
    reasons.push(`decision expected ${entry.expectedDecision}, got ${result.decision}`);
    failureTypes.push('decision_mismatch');
  }

  for (const category of expectedCategories) {
    if (!categories.includes(category)) {
      reasons.push(`missing category ${category}`);
      failureTypes.push('missing_category');
    }
  }

  if (expectedCategories.length === 0 && categories.length > 0) {
    reasons.push(`expected no categories, got ${categories.join(', ')}`);
    failureTypes.push('unexpected_category');
  }

  if (!riskMeetsExpected(result.riskLevel, entry.expectedSeverity)) {
    reasons.push(`riskLevel expected at least ${entry.expectedSeverity}, got ${result.riskLevel}`);
    failureTypes.push('severity_below_expected');
  }

  if (!hasEvidence(result)) {
    reasons.push('non-PASS result returned insufficient evidence');
    failureTypes.push('missing_evidence');
  }

  if (!rewriteIsSafe(result)) {
    reasons.push('compliant rewrite still contains high-risk text');
    failureTypes.push('unsafe_rewrite');
  }

  return { entry, result, reasons, failureTypes: uniqueSorted(failureTypes) };
}

function toJobInput(entry: EvalCaseInput): JobPostingInput {
  return entry.jobInput ?? { title: entry.title ?? '未命名岗位', description: entry.description };
}

function expectedPayload(entry: EvalCaseInput): Record<string, unknown> {
  return {
    decision: entry.expectedDecision,
    categories: entry.expectedCategories,
    severity: entry.expectedSeverity,
  };
}

function actualPayload(result: AuditResult): Record<string, unknown> {
  return {
    auditId: result.auditId,
    decision: result.decision,
    riskLevel: result.riskLevel,
    categories: actualCategories(result),
    evidenceCount: result.evidence.length,
    findingCount: result.findings.length,
  };
}

function toFailure(
  evalRunId: string,
  evaluation: CaseEvaluation,
  index: number,
  createdAt: string,
): EvalFailureRecord {
  return {
    id: `${evalRunId}:failure:${String(index + 1).padStart(4, '0')}`,
    evalRunId,
    caseId: evaluation.entry.id,
    expected: expectedPayload(evaluation.entry),
    actual: actualPayload(evaluation.result),
    failureType: evaluation.failureTypes[0] ?? 'unknown',
    reason: evaluation.reasons.join('; '),
    createdAt,
  };
}

export async function runEvalDataset(
  cases: readonly EvalCaseInput[],
  options: RunEvalDatasetOptions,
): Promise<EvalRunReport> {
  const now = options.now ?? (() => new Date());
  const createdAt = now().toISOString();
  const evalRunId = options.evalRunId ?? `eval_run_${Date.now()}`;
  const ruleVersion = options.ruleVersion ?? '1.0.0';
  const lawKbVersion = options.lawKbVersion ?? 'local-2026-06-12';
  const modelVersion = options.modelVersion ?? 'mock';

  const evaluations: CaseEvaluation[] = [];
  for (const entry of cases) {
    const result = await auditJobPosting(toJobInput(entry), {
      ...options,
      ruleVersion,
      lawKbVersion,
      now,
    });
    evaluations.push(evaluateCase(entry, result));
  }

  let decisionMatches = 0;
  let expectedCategoryTotal = 0;
  let actualCategoryTotal = 0;
  let matchedCategoryTotal = 0;
  let criticalExpected = 0;
  let criticalMatched = 0;
  let expectedPassTotal = 0;
  let falsePositiveTotal = 0;
  let expectedRiskTotal = 0;
  let falseNegativeTotal = 0;
  let manualReviewTotal = 0;
  let evidenceEligibleTotal = 0;
  let evidencePassedTotal = 0;
  let rewritePassedTotal = 0;

  for (const evaluation of evaluations) {
    const { entry, result } = evaluation;
    const expectedCategories = uniqueSorted(entry.expectedCategories);
    const categories = actualCategories(result);

    if (result.decision === entry.expectedDecision) decisionMatches += 1;

    expectedCategoryTotal += expectedCategories.length;
    actualCategoryTotal += categories.length;
    for (const category of expectedCategories) {
      if (categories.includes(category)) matchedCategoryTotal += 1;
    }

    if (criticalSeverityValues.has(entry.expectedSeverity ?? '')) {
      criticalExpected += 1;
      if (result.riskLevel === 'CRITICAL' || result.decision === 'REJECT') {
        criticalMatched += 1;
      }
    }

    if (entry.expectedDecision === 'PASS') {
      expectedPassTotal += 1;
      if (result.decision !== 'PASS') falsePositiveTotal += 1;
    } else {
      expectedRiskTotal += 1;
      if (result.decision === 'PASS') falseNegativeTotal += 1;
    }

    if (result.decision === 'MANUAL_REVIEW') manualReviewTotal += 1;
    if (result.decision !== 'PASS') {
      evidenceEligibleTotal += 1;
      if (hasEvidence(result)) evidencePassedTotal += 1;
    }
    if (rewriteIsSafe(result)) rewritePassedTotal += 1;
  }

  const failedEvaluations = evaluations.filter((evaluation) => evaluation.reasons.length > 0);
  const totalCases = cases.length;
  const failures = failedEvaluations.map((evaluation, index) =>
    toFailure(evalRunId, evaluation, index, createdAt),
  );

  return {
    id: evalRunId,
    datasetId: options.datasetId,
    ruleVersion,
    lawKbVersion,
    modelVersion,
    totalCases,
    passedCases: totalCases - failures.length,
    failedCases: failures.length,
    decisionAccuracy: ratio(decisionMatches, totalCases, 0),
    categoryPrecision: ratio(matchedCategoryTotal, actualCategoryTotal),
    categoryRecall: ratio(matchedCategoryTotal, expectedCategoryTotal),
    criticalRecall: ratio(criticalMatched, criticalExpected),
    falsePositiveRate: ratio(falsePositiveTotal, expectedPassTotal, 0),
    falseNegativeRate: ratio(falseNegativeTotal, expectedRiskTotal, 0),
    manualReviewRate: ratio(manualReviewTotal, totalCases, 0),
    evidenceAccuracy: ratio(evidencePassedTotal, evidenceEligibleTotal),
    rewriteSafetyRate: ratio(rewritePassedTotal, totalCases, 0),
    failures,
    createdAt,
  };
}

export function normalizeEvalCase(input: EvalCaseInput): EvalCaseInput {
  return {
    ...input,
    expectedCategories: input.expectedCategories as RiskCategory[],
    source: input.source || 'jsonl',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
