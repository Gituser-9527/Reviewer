import type { AuditResult, Finding, Severity } from '@job-compliance/shared';
import { RiskAggregator } from './risk-aggregator.js';

/** Machine-readable issue found during the reflection pass. */
export interface ReflectionIssue {
  /** Stable issue code. */
  code: 'HIGH_RISK_WITHOUT_TRACE' | 'DECISION_MISMATCH' | 'RISK_LEVEL_MISMATCH';
  /** Human-readable consistency failure. */
  message: string;
  /** Finding associated with the issue, when applicable. */
  findingId?: string;
}

/** Result of the basic reflection pass. */
export interface ReflectionCheckResult {
  /** Whether the result satisfies all basic consistency checks. */
  passed: boolean;
  /** Consistency issues found in the result. */
  issues: ReflectionIssue[];
}

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

function hasTrace(finding: Finding): boolean {
  return Boolean(finding.ruleId || finding.evidenceId);
}

/** Performs deterministic traceability and aggregation consistency checks. */
export class ReflectionChecker {
  constructor(private readonly riskAggregator: RiskAggregator = new RiskAggregator()) {}

  /** Checks an audit result without changing it. */
  check(result: AuditResult): ReflectionCheckResult {
    const issues: ReflectionIssue[] = result.findings
      .filter((finding) => highRiskLevels.has(finding.severity) && !hasTrace(finding))
      .map((finding) => ({
        code: 'HIGH_RISK_WITHOUT_TRACE' as const,
        message: `High-risk finding ${finding.id} must include ruleId or evidenceId.`,
        findingId: finding.id,
      }));

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

    return { passed: issues.length === 0, issues };
  }

  /** Throws when an audit result fails a mandatory reflection check. */
  assertValid(result: AuditResult): void {
    const check = this.check(result);
    if (!check.passed) throw new AuditReflectionError(check.issues);
  }
}
