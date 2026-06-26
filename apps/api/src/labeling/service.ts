import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '@job-compliance/database';
import type {
  AuditDecision,
  HumanReviewDecision,
  HumanReviewFeedbackType,
  HumanReviewTicket,
  RiskCategory,
} from '@job-compliance/shared';

export type LabelSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DisputedCaseStatus = 'open' | 'resolved';

export interface ReviewerDecisionRecord {
  id: string;
  reviewTicketId: string;
  auditRunId: string;
  tenantId: string;
  reviewerId: string;
  finalDecision: HumanReviewDecision;
  normalizedDecision: AuditDecision;
  categories: RiskCategory[];
  severity: LabelSeverity;
  feedbackType: HumanReviewFeedbackType;
  comment: string;
  confidence: number;
  createdAt: string;
}

export interface ReviewerAgreementStatsRecord {
  reviewerId: string;
  totalLabeled: number;
  agreementCount: number;
  disagreementCount: number;
  agreementRate: number;
  updatedAt: string;
}

export interface DisputedCaseRecord {
  id: string;
  reviewTicketId: string;
  auditRunId: string;
  tenantId: string;
  status: DisputedCaseStatus;
  reason: string;
  reviewerDecisionIds: string[];
  finalDecision?: HumanReviewDecision;
  finalCategories?: RiskCategory[];
  finalSeverity?: LabelSeverity;
  resolvedBy?: string;
  resolutionComment?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface SubmitReviewerDecisionInput {
  ticket: HumanReviewTicket;
  reviewerId: string;
  finalDecision: HumanReviewDecision;
  categories: RiskCategory[];
  severity: LabelSeverity;
  feedbackType: HumanReviewFeedbackType;
  comment?: string;
  confidence?: number;
}

export interface ResolveDisputeInput {
  resolvedBy: string;
  finalDecision: HumanReviewDecision;
  finalCategories: RiskCategory[];
  finalSeverity: LabelSeverity;
  resolutionComment?: string;
}

export interface LabelingReference {
  riskLevels: Array<{ level: LabelSeverity; meaning: string; recommendedAction: string }>;
  feedbackTypes: Array<{ type: HumanReviewFeedbackType; meaning: string }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizedDecision(decision: HumanReviewDecision): AuditDecision {
  if (decision === 'APPROVE') return 'PASS';
  if (decision === 'REJECT') return 'REJECT';
  return 'MANUAL_REVIEW';
}

function normalizeCategories(categories: RiskCategory[]): RiskCategory[] {
  return [...new Set(categories)].sort();
}

function labelKey(decision: ReviewerDecisionRecord): string {
  return `${decision.normalizedDecision}|${decision.severity}|${decision.categories.join(',')}`;
}

function clampConfidence(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

export class LabelingService {
  private readonly decisions = new Map<string, ReviewerDecisionRecord>();
  private readonly disputes = new Map<string, DisputedCaseRecord>();
  private readonly stats = new Map<string, ReviewerAgreementStatsRecord>();

  submitReviewerDecision(input: SubmitReviewerDecisionInput): ReviewerDecisionRecord {
    const existing = [...this.decisions.values()].find(
      (decision) =>
        decision.reviewTicketId === input.ticket.id && decision.reviewerId === input.reviewerId,
    );
    if (existing !== undefined) {
      this.decisions.delete(existing.id);
    }
    const createdAt = nowIso();
    const record: ReviewerDecisionRecord = {
      id: `reviewer_decision_${randomUUID()}`,
      reviewTicketId: input.ticket.id,
      auditRunId: input.ticket.auditRunId,
      tenantId: input.ticket.tenantId,
      reviewerId: input.reviewerId,
      finalDecision: input.finalDecision,
      normalizedDecision: normalizedDecision(input.finalDecision),
      categories: normalizeCategories(input.categories),
      severity: input.severity,
      feedbackType: input.feedbackType,
      comment: redactSensitiveText(input.comment ?? ''),
      confidence: clampConfidence(input.confidence),
      createdAt,
    };
    this.decisions.set(record.id, structuredClone(record));
    this.refreshDisputeForTicket(record.reviewTicketId);
    this.recomputeStats();
    return structuredClone(record);
  }

  listReviewerDecisions(reviewTicketId?: string): ReviewerDecisionRecord[] {
    return [...this.decisions.values()]
      .filter((decision) => reviewTicketId === undefined || decision.reviewTicketId === reviewTicketId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((decision) => structuredClone(decision));
  }

  listAgreementStats(): ReviewerAgreementStatsRecord[] {
    return [...this.stats.values()]
      .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId))
      .map((stat) => structuredClone(stat));
  }

  listDisputedCases(options: { status?: DisputedCaseStatus | 'all'; tenantId?: string } = {}): DisputedCaseRecord[] {
    const status = options.status ?? 'open';
    return [...this.disputes.values()]
      .filter((dispute) => status === 'all' || dispute.status === status)
      .filter((dispute) => options.tenantId === undefined || dispute.tenantId === options.tenantId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((dispute) => structuredClone(dispute));
  }

  findDisputedCase(id: string): DisputedCaseRecord | undefined {
    const dispute = this.disputes.get(id);
    return dispute === undefined ? undefined : structuredClone(dispute);
  }

  resolveDisputedCase(id: string, input: ResolveDisputeInput): DisputedCaseRecord | undefined {
    const dispute = this.disputes.get(id);
    if (dispute === undefined) return undefined;
    const now = nowIso();
    const updated: DisputedCaseRecord = {
      ...dispute,
      status: 'resolved',
      finalDecision: input.finalDecision,
      finalCategories: normalizeCategories(input.finalCategories),
      finalSeverity: input.finalSeverity,
      resolvedBy: input.resolvedBy,
      ...(input.resolutionComment === undefined
        ? {}
        : { resolutionComment: redactSensitiveText(input.resolutionComment) }),
      updatedAt: now,
      resolvedAt: now,
    };
    this.disputes.set(id, structuredClone(updated));
    return structuredClone(updated);
  }

  getReference(): LabelingReference {
    return {
      riskLevels: [
        { level: 'NONE', meaning: '未发现当前规则可识别风险', recommendedAction: '可通过' },
        { level: 'LOW', meaning: '轻微不规范或提示性风险', recommendedAction: '可通过并提示' },
        { level: 'MEDIUM', meaning: '存在可修改风险', recommendedAction: '允许发布需警示或要求修改' },
        { level: 'HIGH', meaning: '较高合规风险或依据不足但影响较大', recommendedAction: '人工复核' },
        { level: 'CRITICAL', meaning: '明确高风险命中', recommendedAction: '建议拦截' },
      ],
      feedbackTypes: [
        { type: 'FALSE_POSITIVE', meaning: 'Agent 误杀，人工认为不应判风险' },
        { type: 'FALSE_NEGATIVE', meaning: 'Agent 漏判，人工发现风险' },
        { type: 'WRONG_CATEGORY', meaning: '风险类别错误' },
        { type: 'WRONG_SEVERITY', meaning: '风险等级错误' },
        { type: 'WRONG_EVIDENCE', meaning: '依据不相关、引用错误或不足' },
        { type: 'BAD_REWRITE', meaning: '改写文案仍有风险或不可用' },
        { type: 'RULE_TOO_BROAD', meaning: '规则过宽，导致误杀' },
        { type: 'RULE_TOO_NARROW', meaning: '规则过窄，导致漏判' },
        { type: 'NEEDS_NEW_RULE', meaning: '当前规则体系未覆盖' },
        { type: 'VALID_RESULT', meaning: 'Agent 结果有效' },
      ],
    };
  }

  clear(): void {
    this.decisions.clear();
    this.disputes.clear();
    this.stats.clear();
  }

  private refreshDisputeForTicket(reviewTicketId: string): void {
    const decisions = this.listReviewerDecisions(reviewTicketId);
    if (decisions.length < 2) return;
    const keys = new Set(decisions.map(labelKey));
    const existing = [...this.disputes.values()].find(
      (dispute) => dispute.reviewTicketId === reviewTicketId,
    );
    if (keys.size <= 1) {
      if (existing !== undefined && existing.status === 'open') {
        this.disputes.delete(existing.id);
      }
      return;
    }
    const first = decisions[0];
    if (first === undefined) return;
    const now = nowIso();
    const dispute: DisputedCaseRecord = {
      id: existing?.id ?? `disputed_case_${randomUUID()}`,
      reviewTicketId,
      auditRunId: first.auditRunId,
      tenantId: first.tenantId,
      status: existing?.status ?? 'open',
      reason: 'Reviewer labels disagree on finalDecision, categories, or severity.',
      reviewerDecisionIds: decisions.map((decision) => decision.id),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.finalDecision === undefined ? {} : { finalDecision: existing.finalDecision }),
      ...(existing?.finalCategories === undefined ? {} : { finalCategories: existing.finalCategories }),
      ...(existing?.finalSeverity === undefined ? {} : { finalSeverity: existing.finalSeverity }),
      ...(existing?.resolvedBy === undefined ? {} : { resolvedBy: existing.resolvedBy }),
      ...(existing?.resolutionComment === undefined
        ? {}
        : { resolutionComment: existing.resolutionComment }),
      ...(existing?.resolvedAt === undefined ? {} : { resolvedAt: existing.resolvedAt }),
    };
    this.disputes.set(dispute.id, dispute);
  }

  private recomputeStats(): void {
    this.stats.clear();
    const decisionsByTicket = new Map<string, ReviewerDecisionRecord[]>();
    for (const decision of this.decisions.values()) {
      const group = decisionsByTicket.get(decision.reviewTicketId) ?? [];
      group.push(decision);
      decisionsByTicket.set(decision.reviewTicketId, group);
    }
    const reviewerTotals = new Map<string, { total: number; agree: number; disagree: number }>();
    for (const decisions of decisionsByTicket.values()) {
      if (decisions.length < 2) continue;
      const counts = new Map<string, number>();
      for (const decision of decisions) {
        const key = labelKey(decision);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const maxCount = Math.max(...counts.values());
      const majorityKeys = new Set(
        [...counts.entries()].filter(([, count]) => count === maxCount).map(([key]) => key),
      );
      const hasTie = majorityKeys.size > 1;
      for (const decision of decisions) {
        const current = reviewerTotals.get(decision.reviewerId) ?? {
          total: 0,
          agree: 0,
          disagree: 0,
        };
        current.total += 1;
        if (!hasTie && majorityKeys.has(labelKey(decision))) {
          current.agree += 1;
        } else {
          current.disagree += 1;
        }
        reviewerTotals.set(decision.reviewerId, current);
      }
    }
    const updatedAt = nowIso();
    for (const [reviewerId, value] of reviewerTotals.entries()) {
      const stat: ReviewerAgreementStatsRecord = {
        reviewerId,
        totalLabeled: value.total,
        agreementCount: value.agree,
        disagreementCount: value.disagree,
        agreementRate: value.total === 0 ? 0 : value.agree / value.total,
        updatedAt,
      };
      this.stats.set(reviewerId, stat);
    }
  }
}
