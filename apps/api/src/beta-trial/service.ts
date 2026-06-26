import { randomUUID } from 'node:crypto';
import type {
  AuditDecision,
  AuditResult,
  HumanReviewDecision,
  HumanReviewFeedbackType,
} from '@job-compliance/shared';
import { redactSensitiveText } from '@job-compliance/database';

export const betaTrialModes = ['shadow_mode', 'assist_mode', 'enforce_mode'] as const;
export type BetaTrialMode = (typeof betaTrialModes)[number];
export type ComparisonResult = 'AGREE' | 'DISAGREE' | 'PENDING';

export interface TenantLevelModeRecord {
  tenantId: string;
  mode: BetaTrialMode;
  enabled: boolean;
  updatedBy?: string;
  updatedAt: string;
}

export interface BetaTrialRunRecord {
  id: string;
  tenantId: string;
  auditRunId: string;
  mode: BetaTrialMode;
  agentDecision: AuditDecision;
  agentRiskLevel: AuditResult['riskLevel'];
  agentRuleIds: string[];
  agentEvidenceIds: string[];
  agentSummary: string;
  humanDecision?: HumanReviewDecision;
  humanDecisionMapped?: AuditDecision;
  reviewerId?: string;
  feedbackType?: HumanReviewFeedbackType;
  humanComment?: string;
  comparisonResult: ComparisonResult;
  falsePositive: boolean;
  falseNegative: boolean;
  businessImpactApplied: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecordHumanResultInput {
  auditRunId?: string;
  trialRunId?: string;
  reviewerId: string;
  finalDecision: HumanReviewDecision;
  feedbackType: HumanReviewFeedbackType;
  comment?: string;
}

export interface BetaTrialRunListOptions {
  tenantId?: string;
  mode?: BetaTrialMode;
  mismatchOnly?: boolean;
}

export interface BetaTrialReport {
  tenantId?: string;
  date: string;
  total: number;
  compared: number;
  pending: number;
  agentHumanAgreementRate: number;
  severeRiskRecall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  estimatedManualReviewMinutesSaved: number;
  topFalsePositiveRules: Array<{ ruleId: string; count: number }>;
  topFalseNegativeRules: Array<{ ruleId: string; count: number }>;
  topEvidenceErrors: Array<{ evidenceId: string; count: number }>;
  mismatchSamples: BetaTrialRunRecord[];
  generatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function dayOf(value: string): string {
  return value.slice(0, 10);
}

function mapHumanDecision(decision: HumanReviewDecision): AuditDecision {
  if (decision === 'APPROVE') return 'PASS';
  if (decision === 'REJECT') return 'REJECT';
  return 'MANUAL_REVIEW';
}

function isAgentRisky(decision: AuditDecision): boolean {
  return decision !== 'PASS';
}

function isHumanRisky(decision?: HumanReviewDecision): boolean {
  return decision === 'REJECT' || decision === 'REQUEST_REVISION';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function topCounts(values: string[], limit = 10): Array<{ ruleId: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([ruleId, count]) => ({ ruleId, count }));
}

function topEvidenceCounts(values: string[], limit = 10): Array<{ evidenceId: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([evidenceId, count]) => ({ evidenceId, count }));
}

export class BetaTrialService {
  private readonly tenantModes = new Map<string, TenantLevelModeRecord>();
  private readonly runs = new Map<string, BetaTrialRunRecord>();

  listTenantModes(): TenantLevelModeRecord[] {
    return [...this.tenantModes.values()].sort((left, right) =>
      left.tenantId.localeCompare(right.tenantId),
    );
  }

  getTenantMode(tenantId: string): TenantLevelModeRecord {
    return (
      this.tenantModes.get(tenantId) ?? {
        tenantId,
        mode: 'shadow_mode',
        enabled: true,
        updatedAt: nowIso(),
      }
    );
  }

  setTenantMode(input: {
    tenantId: string;
    mode: BetaTrialMode;
    enabled?: boolean;
    updatedBy?: string;
  }): TenantLevelModeRecord {
    const record: TenantLevelModeRecord = {
      tenantId: input.tenantId,
      mode: input.mode,
      enabled: input.enabled ?? true,
      ...(input.updatedBy === undefined ? {} : { updatedBy: input.updatedBy }),
      updatedAt: nowIso(),
    };
    this.tenantModes.set(input.tenantId, structuredClone(record));
    return structuredClone(record);
  }

  recordAgentRun(result: AuditResult): BetaTrialRunRecord {
    const tenantMode = this.getTenantMode(result.context.tenantId);
    const existing = [...this.runs.values()].find((run) => run.auditRunId === result.auditId);
    if (existing !== undefined) return structuredClone(existing);

    const agentRuleIds = unique(
      result.findings.flatMap((finding) => (finding.ruleId === undefined ? [] : [finding.ruleId])),
    );
    const agentEvidenceIds = unique([
      ...result.evidence.map((evidence) => evidence.id),
      ...result.findings.flatMap((finding) => finding.evidenceIds),
    ]);
    const timestamp = nowIso();
    const record: BetaTrialRunRecord = {
      id: `beta_trial_${randomUUID()}`,
      tenantId: result.context.tenantId,
      auditRunId: result.auditId,
      mode: tenantMode.mode,
      agentDecision: result.decision,
      agentRiskLevel: result.riskLevel,
      agentRuleIds,
      agentEvidenceIds,
      agentSummary: redactSensitiveText(result.summary),
      comparisonResult: 'PENDING',
      falsePositive: false,
      falseNegative: false,
      businessImpactApplied: tenantMode.enabled && tenantMode.mode === 'enforce_mode',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.runs.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  recordHumanResult(input: RecordHumanResultInput): BetaTrialRunRecord | undefined {
    const existing = this.findRunForHumanResult(input);
    if (existing === undefined) return undefined;
    const humanDecisionMapped = mapHumanDecision(input.finalDecision);
    const comparisonResult: ComparisonResult =
      existing.agentDecision === humanDecisionMapped ? 'AGREE' : 'DISAGREE';
    const falsePositive = isAgentRisky(existing.agentDecision) && input.finalDecision === 'APPROVE';
    const falseNegative = !isAgentRisky(existing.agentDecision) && isHumanRisky(input.finalDecision);
    const updated: BetaTrialRunRecord = {
      ...existing,
      humanDecision: input.finalDecision,
      humanDecisionMapped,
      reviewerId: input.reviewerId,
      feedbackType: input.feedbackType,
      ...(input.comment === undefined ? {} : { humanComment: redactSensitiveText(input.comment) }),
      comparisonResult,
      falsePositive,
      falseNegative,
      updatedAt: nowIso(),
    };
    this.runs.set(updated.id, structuredClone(updated));
    return structuredClone(updated);
  }

  listRuns(options: BetaTrialRunListOptions = {}): BetaTrialRunRecord[] {
    return [...this.runs.values()]
      .filter((run) => options.tenantId === undefined || run.tenantId === options.tenantId)
      .filter((run) => options.mode === undefined || run.mode === options.mode)
      .filter((run) => options.mismatchOnly !== true || run.comparisonResult === 'DISAGREE')
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((run) => structuredClone(run));
  }

  findRunById(id: string): BetaTrialRunRecord | undefined {
    const run = this.runs.get(id);
    return run === undefined ? undefined : structuredClone(run);
  }

  generateDailyReport(options: { tenantId?: string; date?: string; mode?: BetaTrialMode } = {}): BetaTrialReport {
    const date = options.date ?? dayOf(nowIso());
    const runs = this.listRuns({
      ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    }).filter((run) => dayOf(run.createdAt) === date);
    const compared = runs.filter((run) => run.comparisonResult !== 'PENDING');
    const agreement = compared.filter((run) => run.comparisonResult === 'AGREE').length;
    const severeHuman = compared.filter((run) => isHumanRisky(run.humanDecision));
    const severeCaptured = severeHuman.filter(
      (run) =>
        run.agentDecision === 'REJECT' ||
        run.agentDecision === 'MANUAL_REVIEW' ||
        run.agentRiskLevel === 'CRITICAL' ||
        run.agentRiskLevel === 'HIGH',
    ).length;
    const falsePositiveRuns = compared.filter((run) => run.falsePositive);
    const falseNegativeRuns = compared.filter((run) => run.falseNegative);
    const evidenceErrorRuns = compared.filter((run) => run.feedbackType === 'WRONG_EVIDENCE');
    const agreedAutoResolvable = compared.filter(
      (run) => run.comparisonResult === 'AGREE' && run.agentDecision !== 'MANUAL_REVIEW',
    ).length;

    return {
      ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
      date,
      total: runs.length,
      compared: compared.length,
      pending: runs.length - compared.length,
      agentHumanAgreementRate: compared.length === 0 ? 0 : agreement / compared.length,
      severeRiskRecall: severeHuman.length === 0 ? 0 : severeCaptured / severeHuman.length,
      falsePositiveRate: compared.length === 0 ? 0 : falsePositiveRuns.length / compared.length,
      falseNegativeRate: compared.length === 0 ? 0 : falseNegativeRuns.length / compared.length,
      estimatedManualReviewMinutesSaved: agreedAutoResolvable * 2,
      topFalsePositiveRules: topCounts(falsePositiveRuns.flatMap((run) => run.agentRuleIds)),
      topFalseNegativeRules: topCounts(falseNegativeRuns.flatMap((run) => run.agentRuleIds)),
      topEvidenceErrors: topEvidenceCounts(evidenceErrorRuns.flatMap((run) => run.agentEvidenceIds)),
      mismatchSamples: compared.filter((run) => run.comparisonResult === 'DISAGREE').slice(0, 50),
      generatedAt: nowIso(),
    };
  }

  clear(): void {
    this.tenantModes.clear();
    this.runs.clear();
  }

  private findRunForHumanResult(input: RecordHumanResultInput): BetaTrialRunRecord | undefined {
    if (input.trialRunId !== undefined) return this.runs.get(input.trialRunId);
    if (input.auditRunId === undefined) return undefined;
    return [...this.runs.values()].find((run) => run.auditRunId === input.auditRunId);
  }
}
