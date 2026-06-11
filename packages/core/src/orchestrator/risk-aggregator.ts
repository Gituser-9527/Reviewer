import type { AuditDecision, Finding, Severity } from '@job-compliance/shared';

/** Aggregate decision and highest risk level for a set of findings. */
export interface RiskAggregation {
  /** Final decision derived from the highest finding severity. */
  decision: AuditDecision;
  /** Highest risk level, or NONE when there are no findings. */
  riskLevel: Severity | 'NONE';
}

const severityRank: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Deterministically aggregates finding severities into an audit decision. */
export class RiskAggregator {
  /** Returns the decision required by the highest finding severity. */
  aggregate(findings: readonly Finding[]): RiskAggregation {
    const riskLevel = findings.reduce<Severity | 'NONE'>((highest, finding) => {
      if (highest === 'NONE') return finding.severity;
      return severityRank[finding.severity] > severityRank[highest] ? finding.severity : highest;
    }, 'NONE');

    switch (riskLevel) {
      case 'CRITICAL':
        return { decision: 'REJECT', riskLevel };
      case 'HIGH':
        return { decision: 'MANUAL_REVIEW', riskLevel };
      case 'MEDIUM':
      case 'LOW':
        return { decision: 'ALLOW_WITH_WARNING', riskLevel };
      case 'NONE':
        return { decision: 'PASS', riskLevel };
    }
  }
}
