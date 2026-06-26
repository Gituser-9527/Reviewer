import { randomUUID } from 'node:crypto';
import { normalizeEvalCase, type EvalCaseInput } from '@job-compliance/core';
import { redactJson, redactSensitiveText } from '@job-compliance/database';
import type {
  AuditDecision,
  AuditResult,
  Evidence,
  Finding,
  RiskCategory,
  RuleImprovementSuggestion,
} from '@job-compliance/shared';
import type {
  AddAppealMessageInput,
  AppealFinalDecision,
  AppealReasonType,
  AppealStatus,
  CreateAppealInput,
  SubmitAppealReviewResultInput,
} from './schemas.js';

export interface AppealCaseRecord {
  id: string;
  tenantId: string;
  auditRunId: string;
  status: AppealStatus;
  reasonType: AppealReasonType;
  reasonText: string;
  supplementalText?: string;
  submitterId: string;
  originalDecision: AuditDecision;
  originalRiskLevel: AuditResult['riskLevel'];
  originalFindings: Finding[];
  originalEvidence: Evidence[];
  originalSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppealMessageRecord {
  id: string;
  appealCaseId: string;
  tenantId: string;
  senderType: 'enterprise' | 'reviewer' | 'agent';
  senderId: string;
  message: string;
  attachments: string[];
  createdAt: string;
}

export interface AppealReviewResultRecord {
  id: string;
  appealCaseId: string;
  tenantId: string;
  reviewerId: string;
  finalDecision: AppealFinalDecision;
  comment: string;
  createdAt: string;
}

export interface AppealSimilarCase {
  appealCaseId: string;
  auditRunId: string;
  reasonType: AppealReasonType;
  finalDecision: AppealFinalDecision;
  categories: RiskCategory[];
}

export interface AppealAgentReportRecord {
  id: string;
  appealCaseId: string;
  tenantId: string;
  maintainReasons: string[];
  overturnReasons: string[];
  evidenceSummary: string;
  similarCases: AppealSimilarCase[];
  recommendation: AppealFinalDecision;
  confidence: number;
  createdAt: string;
}

export interface AppealCaseDetail extends AppealCaseRecord {
  messages: AppealMessageRecord[];
  agentReport?: AppealAgentReportRecord;
  reviewResult?: AppealReviewResultRecord;
}

export interface CreateRuleSuggestionFromAppealInput {
  appealCaseId: string;
  createdBy: string;
  title?: string;
  description?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function categoriesFor(caseRecord: AppealCaseRecord): RiskCategory[] {
  return [...new Set(caseRecord.originalFindings.map((finding) => finding.category))];
}

function evalDecisionForAppeal(
  originalDecision: AuditDecision,
  finalDecision: AppealFinalDecision,
): AuditDecision {
  if (finalDecision === 'OVERTURN') return 'PASS';
  if (finalDecision === 'REQUEST_REVISION') return 'MANUAL_REVIEW';
  return originalDecision;
}

export class InMemoryAppealStore {
  private readonly cases = new Map<string, AppealCaseRecord>();
  private readonly messages = new Map<string, AppealMessageRecord[]>();
  private readonly reports = new Map<string, AppealAgentReportRecord>();
  private readonly reviewResults = new Map<string, AppealReviewResultRecord>();
  private readonly suggestions = new Map<string, RuleImprovementSuggestion>();

  createAppeal(input: CreateAppealInput, auditResult: AuditResult): AppealCaseRecord {
    const timestamp = nowIso();
    const record: AppealCaseRecord = {
      id: `appeal_${randomUUID()}`,
      tenantId: input.tenantId,
      auditRunId: input.auditRunId,
      status: 'submitted',
      reasonType: input.reasonType,
      reasonText: redactSensitiveText(input.reasonText),
      ...(input.supplementalText === undefined
        ? {}
        : { supplementalText: redactSensitiveText(input.supplementalText) }),
      submitterId: input.submitterId,
      originalDecision: auditResult.decision,
      originalRiskLevel: auditResult.riskLevel,
      originalFindings: redactJson(auditResult.findings),
      originalEvidence: redactJson(auditResult.evidence),
      originalSummary: redactSensitiveText(auditResult.summary),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.cases.set(record.id, structuredClone(record));
    this.messages.set(record.id, [
      {
        id: `appeal_msg_${randomUUID()}`,
        appealCaseId: record.id,
        tenantId: record.tenantId,
        senderType: 'enterprise',
        senderId: record.submitterId,
        message: record.reasonText,
        attachments: [],
        createdAt: timestamp,
      },
    ]);
    return structuredClone(record);
  }

  findById(id: string): AppealCaseDetail | undefined {
    const record = this.cases.get(id);
    if (record === undefined) return undefined;
    const agentReport = this.reports.get(id);
    const reviewResult = this.reviewResults.get(id);
    return {
      ...structuredClone(record),
      messages: structuredClone(this.messages.get(id) ?? []),
      ...(agentReport === undefined ? {} : { agentReport: structuredClone(agentReport) }),
      ...(reviewResult === undefined ? {} : { reviewResult: structuredClone(reviewResult) }),
    };
  }

  list(options: { status?: AppealStatus | 'all'; tenantId?: string } = {}): AppealCaseRecord[] {
    const status = options.status ?? 'submitted';
    return [...this.cases.values()]
      .filter((record) => status === 'all' || record.status === status)
      .filter((record) => options.tenantId === undefined || record.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => structuredClone(record));
  }

  addMessage(id: string, input: AddAppealMessageInput): AppealMessageRecord | undefined {
    const record = this.cases.get(id);
    if (record === undefined) return undefined;
    const message: AppealMessageRecord = {
      id: `appeal_msg_${randomUUID()}`,
      appealCaseId: id,
      tenantId: record.tenantId,
      senderType: input.senderType,
      senderId: input.senderId,
      message: redactSensitiveText(input.message),
      attachments: input.attachments.map((attachment) => redactSensitiveText(attachment)),
      createdAt: nowIso(),
    };
    this.messages.set(id, [...(this.messages.get(id) ?? []), structuredClone(message)]);
    const updated: AppealCaseRecord = {
      ...record,
      status: record.status === 'resolved' ? 'resolved' : 'under_review',
      updatedAt: message.createdAt,
    };
    this.cases.set(id, structuredClone(updated));
    return structuredClone(message);
  }

  generateAgentReport(id: string): AppealAgentReportRecord | undefined {
    const record = this.cases.get(id);
    if (record === undefined) return undefined;

    const ruleReasons = record.originalFindings
      .filter((finding) => finding.ruleId !== undefined || finding.evidenceIds.length > 0)
      .slice(0, 5)
      .map((finding) => {
        const trace = finding.ruleId ?? finding.evidenceIds[0] ?? 'traceable_finding';
        return `原审核命中 ${finding.category}/${finding.severity}，依据 ${trace}，建议人工复核确认是否仍适用。`;
      });
    const maintainReasons =
      ruleReasons.length > 0
        ? ruleReasons
        : ['原审核结论已形成结构化 finding，但仍需复审员核对证据充分性。'];

    const reasonMap: Record<AppealReasonType, string> = {
      MISTAKE: '企业主张存在误判，复审员应核对命中文本是否真实表达了限制或收费要求。',
      JOB_SPECIALTY: '企业主张岗位具有特殊性，复审员应确认特殊要求是否与履职必要性直接相关。',
      UPDATED_POSTING: '企业主张已修改文案，复审员应以修改后文案重新审核，而不是直接撤销原结论。',
      INACCURATE_EVIDENCE: '企业质疑依据准确性，复审员应核对 evidence 来源、版本和适用范围。',
      RULE_NOT_APPLICABLE: '企业主张规则不适用，复审员应确认规则适用条件和岗位场景是否匹配。',
      OTHER: '企业提交了其他理由，复审员应结合原始证据和补充说明逐项判断。',
    };
    const overturnReasons = [
      reasonMap[record.reasonType],
      record.supplementalText === undefined
        ? '当前补充材料有限，若企业能提供修改后文案或岗位必要性说明，可能支持调整处理方式。'
        : `企业补充说明已提交：${record.supplementalText}`,
    ];

    const similarCases = this.findSimilarResolvedCases(record).slice(0, 5);
    const recommendation: AppealFinalDecision =
      record.reasonType === 'UPDATED_POSTING'
        ? 'REQUEST_REVISION'
        : record.reasonType === 'INACCURATE_EVIDENCE'
          ? 'REQUEST_REVISION'
          : 'MAINTAIN';
    const evidenceSummary =
      record.originalEvidence.length > 0
        ? `原审核包含 ${record.originalEvidence.length} 条 evidence，主要类别：${[
            ...new Set(record.originalEvidence.map((evidence) => evidence.sourceType)),
          ].join(', ')}。`
        : '原审核未返回独立 evidence，复审员应重点核对 ruleId、matchedText 与原文。';
    const report: AppealAgentReportRecord = {
      id: `appeal_report_${randomUUID()}`,
      appealCaseId: id,
      tenantId: record.tenantId,
      maintainReasons,
      overturnReasons,
      evidenceSummary,
      similarCases,
      recommendation,
      confidence: 0.62,
      createdAt: nowIso(),
    };
    this.reports.set(id, structuredClone(report));
    const updated: AppealCaseRecord = {
      ...record,
      status: 'agent_reported',
      updatedAt: report.createdAt,
    };
    this.cases.set(id, structuredClone(updated));
    return structuredClone(report);
  }

  submitReviewResult(
    id: string,
    input: SubmitAppealReviewResultInput,
  ): AppealReviewResultRecord | undefined {
    const record = this.cases.get(id);
    if (record === undefined) return undefined;
    const result: AppealReviewResultRecord = {
      id: `appeal_review_${randomUUID()}`,
      appealCaseId: id,
      tenantId: record.tenantId,
      reviewerId: input.reviewerId,
      finalDecision: input.finalDecision,
      comment: redactSensitiveText(input.comment),
      createdAt: nowIso(),
    };
    this.reviewResults.set(id, structuredClone(result));
    this.cases.set(id, {
      ...record,
      status: 'resolved',
      updatedAt: result.createdAt,
    });
    return structuredClone(result);
  }

  toEvalCase(id: string, datasetId: string, source: string): EvalCaseInput | undefined {
    const record = this.cases.get(id);
    const result = this.reviewResults.get(id);
    if (record === undefined || result === undefined) return undefined;
    return normalizeEvalCase({
      id: `case_from_appeal_${id}`,
      datasetId,
      source,
      title: `Appeal ${id}`,
      description: redactSensitiveText(
        record.supplementalText ?? record.reasonText ?? record.originalSummary,
      ),
      expectedDecision: evalDecisionForAppeal(record.originalDecision, result.finalDecision),
      expectedCategories: categoriesFor(record),
      ...(record.originalRiskLevel === 'NONE'
        ? {}
        : { expectedSeverity: record.originalRiskLevel }),
      humanReason: result.comment,
      metadata: {
        appealCaseId: id,
        auditRunId: record.auditRunId,
        reasonType: record.reasonType,
        originalDecision: record.originalDecision,
        finalDecision: result.finalDecision,
      },
    });
  }

  createRuleSuggestion(
    input: CreateRuleSuggestionFromAppealInput,
  ): RuleImprovementSuggestion | undefined {
    const record = this.cases.get(input.appealCaseId);
    const result = this.reviewResults.get(input.appealCaseId);
    if (record === undefined) return undefined;
    const firstFinding = record.originalFindings[0];
    const timestamp = nowIso();
    const suggestion: RuleImprovementSuggestion = {
      id: `rule_suggestion_from_appeal_${randomUUID()}`,
      reviewTicketId: input.appealCaseId,
      auditRunId: record.auditRunId,
      tenantId: record.tenantId,
      feedbackType:
        result?.finalDecision === 'OVERTURN'
          ? 'FALSE_POSITIVE'
          : result?.finalDecision === 'REQUEST_REVISION'
            ? 'RULE_TOO_BROAD'
            : 'VALID_RESULT',
      ...(firstFinding?.category === undefined ? {} : { category: firstFinding.category }),
      ...(firstFinding?.ruleId === undefined ? {} : { ruleId: firstFinding.ruleId }),
      title: redactSensitiveText(input.title ?? `Appeal ${input.appealCaseId} rule review`),
      description: redactSensitiveText(
        input.description ??
          result?.comment ??
          `Appeal reason ${record.reasonType}: ${record.reasonText}`,
      ),
      status: 'open',
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.suggestions.set(suggestion.id, structuredClone(suggestion));
    return structuredClone(suggestion);
  }

  listRuleSuggestions(options: { tenantId?: string } = {}): RuleImprovementSuggestion[] {
    return [...this.suggestions.values()]
      .filter(
        (suggestion) => options.tenantId === undefined || suggestion.tenantId === options.tenantId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((suggestion) => structuredClone(suggestion));
  }

  private findSimilarResolvedCases(record: AppealCaseRecord): AppealSimilarCase[] {
    const categories = new Set(categoriesFor(record));
    return [...this.reviewResults.values()]
      .map((result) => {
        const candidate = this.cases.get(result.appealCaseId);
        if (candidate === undefined || candidate.id === record.id) return undefined;
        const candidateCategories = categoriesFor(candidate);
        const overlaps = candidateCategories.some((category) => categories.has(category));
        if (candidate.reasonType !== record.reasonType && !overlaps) return undefined;
        return {
          appealCaseId: candidate.id,
          auditRunId: candidate.auditRunId,
          reasonType: candidate.reasonType,
          finalDecision: result.finalDecision,
          categories: candidateCategories,
        };
      })
      .filter((entry): entry is AppealSimilarCase => entry !== undefined);
  }

  clear(): void {
    this.cases.clear();
    this.messages.clear();
    this.reports.clear();
    this.reviewResults.clear();
    this.suggestions.clear();
  }
}
