import { randomUUID } from 'node:crypto';
import { normalizeEvalCase } from '@job-compliance/core';
import type {
  AuditResult,
  HumanReviewTicket,
  RiskCategory,
} from '@job-compliance/shared';
import type { AuditRunStore } from '../audit/store.js';
import type { InMemoryAppealStore, AppealCaseDetail, AppealCaseRecord } from '../appeals/store.js';
import type { EvalStore } from '../evals/store.js';
import type { HumanReviewStore } from '../reviews/store.js';

export type QaInspectionStrategy = 'random' | 'high_risk_first';
export type QaIssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type QaInspectionStatus = 'completed' | 'failed';
export type QaIssueStatus = 'open' | 'resolved';

export interface QaInspectionJob {
  id: string;
  tenantId: string;
  strategy: QaInspectionStrategy;
  sampleSize: number;
  ruleVersion?: string;
  reviewerId?: string;
  includeAppeals: boolean;
  includeRewrites: boolean;
  includeEvidence: boolean;
  status: QaInspectionStatus;
  sampleCount: number;
  issueCount: number;
  summary: string;
  createdBy: string;
  createdAt: string;
  completedAt: string;
}

export interface QaInspectionSample {
  id: string;
  jobId: string;
  tenantId: string;
  sourceType: 'audit_run' | 'human_review_feedback' | 'appeal_case' | 'rewritten_posting' | 'evidence_link';
  sourceId: string;
  auditRunId?: string;
  reviewerId?: string;
  ruleVersion?: string;
  riskLevel?: string;
  decision?: string;
  createdAt: string;
}

export interface QaInspectionResult {
  id: string;
  jobId: string;
  sampleId: string;
  passed: boolean;
  score: number;
  checks: Array<{
    key: string;
    passed: boolean;
    detail: string;
  }>;
  createdAt: string;
}

export interface QaQualityIssue {
  id: string;
  jobId: string;
  sampleId: string;
  tenantId: string;
  sourceType: QaInspectionSample['sourceType'];
  sourceId: string;
  issueType:
    | 'WRONG_DECISION'
    | 'WRONG_CATEGORY'
    | 'WRONG_SEVERITY'
    | 'BAD_MATCHED_TEXT'
    | 'IRRELEVANT_EVIDENCE'
    | 'UNSAFE_REWRITE'
    | 'SOP_INCONSISTENT_REVIEW'
    | 'APPEAL_HANDLING_RISK';
  severity: QaIssueSeverity;
  description: string;
  status: QaIssueStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionComment?: string;
  linkedEvalCaseId?: string;
  linkedRuleSuggestionId?: string;
}

export interface QaCreateJobInput {
  tenantId: string;
  strategy?: QaInspectionStrategy;
  sampleSize?: number;
  ruleVersion?: string;
  reviewerId?: string;
  includeAppeals?: boolean;
  includeRewrites?: boolean;
  includeEvidence?: boolean;
  createdBy?: string;
}

const riskyRewriteTerms = ['限女性', '限男性', '已婚已育', '保证金', '押金', '培训贷', '服装费'];

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rankRisk(riskLevel: string | undefined): number {
  if (riskLevel === 'CRITICAL') return 5;
  if (riskLevel === 'HIGH') return 4;
  if (riskLevel === 'MEDIUM') return 3;
  if (riskLevel === 'LOW') return 2;
  if (riskLevel === 'NONE') return 1;
  return 0;
}

function deterministicShuffle<T>(items: T[]): T[] {
  return [...items].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export class QaInspectionService {
  private readonly jobs = new Map<string, QaInspectionJob>();
  private readonly samples = new Map<string, QaInspectionSample>();
  private readonly results = new Map<string, QaInspectionResult>();
  private readonly issues = new Map<string, QaQualityIssue>();

  constructor(
    private readonly dependencies: {
      auditRunStore: AuditRunStore;
      reviewStore: HumanReviewStore;
      evalStore: EvalStore;
      appealStore?: InMemoryAppealStore;
    },
  ) {}

  async createJob(input: QaCreateJobInput): Promise<QaInspectionJob> {
    const createdAt = nowIso();
    const job: QaInspectionJob = {
      id: `qa_job_${randomUUID()}`,
      tenantId: input.tenantId,
      strategy: input.strategy ?? 'random',
      sampleSize: input.sampleSize ?? 20,
      ...(input.ruleVersion === undefined ? {} : { ruleVersion: input.ruleVersion }),
      ...(input.reviewerId === undefined ? {} : { reviewerId: input.reviewerId }),
      includeAppeals: input.includeAppeals ?? true,
      includeRewrites: input.includeRewrites ?? true,
      includeEvidence: input.includeEvidence ?? true,
      status: 'completed',
      sampleCount: 0,
      issueCount: 0,
      summary: 'QA inspection is being prepared.',
      createdBy: input.createdBy ?? 'qa_agent',
      createdAt,
      completedAt: createdAt,
    };
    const selectedSamples = await this.sample(job);
    for (const sample of selectedSamples) this.samples.set(sample.id, clone(sample));
    const results = await Promise.all(selectedSamples.map((sample) => this.inspectSample(sample)));
    const issues = results.flatMap((result) => this.issuesFromResult(result));
    const completed: QaInspectionJob = {
      ...job,
      sampleCount: selectedSamples.length,
      issueCount: issues.length,
      summary: `完成 ${selectedSamples.length} 个样本质检，发现 ${issues.length} 个质量问题。`,
      completedAt: nowIso(),
    };
    this.jobs.set(completed.id, clone(completed));
    for (const result of results) this.results.set(result.id, clone(result));
    for (const issue of issues) this.issues.set(issue.id, clone(issue));
    return clone(completed);
  }

  listJobs(options: { tenantId?: string } = {}): QaInspectionJob[] {
    return [...this.jobs.values()]
      .filter((job) => options.tenantId === undefined || job.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  getJob(id: string): (QaInspectionJob & { samples: QaInspectionSample[]; results: QaInspectionResult[] }) | undefined {
    const job = this.jobs.get(id);
    if (job === undefined) return undefined;
    const samples = [...this.samples.values()].filter((sample) => sample.jobId === id).map(clone);
    const results = [...this.results.values()].filter((result) => result.jobId === id).map(clone);
    return { ...clone(job), samples, results };
  }

  listIssues(options: {
    tenantId?: string;
    status?: QaIssueStatus | 'all';
  } = {}): QaQualityIssue[] {
    const status = options.status ?? 'open';
    return [...this.issues.values()]
      .filter((issue) => status === 'all' || issue.status === status)
      .filter((issue) => options.tenantId === undefined || issue.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async resolveIssue(
    id: string,
    input: {
      resolvedBy: string;
      resolutionComment?: string;
      addToEval?: boolean;
      createRuleSuggestion?: boolean;
      datasetId?: string;
    },
  ): Promise<QaQualityIssue | undefined> {
    const issue = this.issues.get(id);
    if (issue === undefined) return undefined;
    let linkedEvalCaseId = issue.linkedEvalCaseId;
    let linkedRuleSuggestionId = issue.linkedRuleSuggestionId;
    if (input.addToEval === true) {
      linkedEvalCaseId = await this.addIssueToEval(issue, input.datasetId ?? 'qa_failed_samples');
    }
    if (input.createRuleSuggestion === true) {
      linkedRuleSuggestionId = await this.createRuleSuggestion(issue, input.resolvedBy);
    }
    const updated: QaQualityIssue = {
      ...issue,
      status: 'resolved',
      resolvedBy: input.resolvedBy,
      ...(input.resolutionComment === undefined ? {} : { resolutionComment: input.resolutionComment }),
      ...(linkedEvalCaseId === undefined ? {} : { linkedEvalCaseId }),
      ...(linkedRuleSuggestionId === undefined ? {} : { linkedRuleSuggestionId }),
      resolvedAt: nowIso(),
    };
    this.issues.set(id, clone(updated));
    return clone(updated);
  }

  private async sample(job: QaInspectionJob): Promise<QaInspectionSample[]> {
    const runs = await this.dependencies.auditRunStore.listByTenant(job.tenantId);
    const reviews = await this.dependencies.reviewStore.list({
      status: 'all',
      tenantId: job.tenantId,
    });
    const auditSamples = runs
      .filter((run) => job.ruleVersion === undefined || run.context.ruleVersion === job.ruleVersion)
      .map((run) => this.sampleFromAuditRun(job, run, 'audit_run'));
    const rewriteSamples = job.includeRewrites
      ? runs
          .filter((run) => run.compliantRewrite !== null)
          .map((run) => this.sampleFromAuditRun(job, run, 'rewritten_posting'))
      : [];
    const evidenceSamples = job.includeEvidence
      ? runs
          .filter((run) => run.evidence.length > 0)
          .map((run) => this.sampleFromAuditRun(job, run, 'evidence_link'))
      : [];
    const reviewSamples = reviews
      .filter(
        (ticket) =>
          job.reviewerId === undefined || ticket.feedback?.reviewerId === job.reviewerId,
      )
      .map((ticket) => this.sampleFromReview(job, ticket));
    const appealSamples =
      job.includeAppeals && this.dependencies.appealStore !== undefined
        ? this.dependencies.appealStore
            .list({
              status: 'all',
              tenantId: job.tenantId,
            })
            .map((appeal) => this.sampleFromAppeal(job, appeal))
        : [];
    const combined = [
      ...auditSamples,
      ...rewriteSamples,
      ...evidenceSamples,
      ...reviewSamples,
      ...appealSamples,
    ];
    const sorted =
      job.strategy === 'high_risk_first'
        ? combined.sort((left, right) => rankRisk(right.riskLevel) - rankRisk(left.riskLevel))
        : deterministicShuffle(combined);
    return sorted.slice(0, job.sampleSize);
  }

  private sampleFromAuditRun(
    job: QaInspectionJob,
    run: AuditResult,
    sourceType: QaInspectionSample['sourceType'],
  ): QaInspectionSample {
    return {
      id: `qa_sample_${randomUUID()}`,
      jobId: job.id,
      tenantId: job.tenantId,
      sourceType,
      sourceId: run.auditId,
      auditRunId: run.auditId,
      ruleVersion: run.context.ruleVersion,
      riskLevel: run.riskLevel,
      decision: run.decision,
      createdAt: nowIso(),
    };
  }

  private sampleFromReview(job: QaInspectionJob, ticket: HumanReviewTicket): QaInspectionSample {
    return {
      id: `qa_sample_${randomUUID()}`,
      jobId: job.id,
      tenantId: job.tenantId,
      sourceType: 'human_review_feedback',
      sourceId: ticket.id,
      auditRunId: ticket.auditRunId,
      ...(ticket.feedback?.reviewerId === undefined ? {} : { reviewerId: ticket.feedback.reviewerId }),
      riskLevel: ticket.riskLevel,
      decision: ticket.feedback?.finalDecision ?? ticket.agentDecision,
      createdAt: nowIso(),
    };
  }

  private sampleFromAppeal(job: QaInspectionJob, appeal: AppealCaseRecord): QaInspectionSample {
    return {
      id: `qa_sample_${randomUUID()}`,
      jobId: job.id,
      tenantId: job.tenantId,
      sourceType: 'appeal_case',
      sourceId: appeal.id,
      auditRunId: appeal.auditRunId,
      riskLevel: appeal.originalRiskLevel,
      decision: appeal.originalDecision,
      createdAt: nowIso(),
    };
  }

  private async inspectSample(sample: QaInspectionSample): Promise<QaInspectionResult> {
    const checks: QaInspectionResult['checks'] = [];
    const audit = sample.auditRunId
      ? this.dependencies.auditRunStore.findById(sample.auditRunId, sample.tenantId)
      : undefined;
    const auditResult = audit instanceof Promise ? await audit : audit;
    const review = sample.sourceType === 'human_review_feedback'
      ? this.dependencies.reviewStore.findById(sample.sourceId)
      : undefined;
    const reviewTicket = review instanceof Promise ? await review : review;
    const appeal =
      sample.sourceType === 'appeal_case'
        ? this.dependencies.appealStore?.findById(sample.sourceId)
        : undefined;

    if (auditResult !== undefined) {
      checks.push(...this.auditChecks(auditResult, sample));
    }
    if (reviewTicket !== undefined) {
      checks.push(...this.reviewChecks(reviewTicket));
    }
    if (appeal !== undefined) {
      checks.push(...this.appealChecks(appeal));
    }
    if (checks.length === 0) {
      checks.push({ key: 'sample_available', passed: false, detail: 'Sample source could not be loaded.' });
    }
    const passedCount = checks.filter((check) => check.passed).length;
    return {
      id: `qa_result_${randomUUID()}`,
      jobId: sample.jobId,
      sampleId: sample.id,
      passed: passedCount === checks.length,
      score: checks.length === 0 ? 0 : Math.round((passedCount / checks.length) * 100),
      checks,
      createdAt: nowIso(),
    };
  }

  private auditChecks(result: AuditResult, sample: QaInspectionSample): QaInspectionResult['checks'] {
    const highFindings = result.findings.filter(
      (finding) => finding.severity === 'HIGH' || finding.severity === 'CRITICAL',
    );
    const matchedTexts = result.findings.flatMap((finding) => {
      const metadata = finding.metadata as { matchedText?: unknown } | undefined;
      return Array.isArray(metadata?.matchedText)
        ? metadata.matchedText.filter((value): value is string => typeof value === 'string')
        : [];
    });
    const evidenceText = result.evidence.map((evidence) => `${evidence.title} ${evidence.quote ?? ''}`).join('\n');
    const checks: QaInspectionResult['checks'] = [
      {
        key: 'decision_reasonable',
        passed:
          (result.decision === 'PASS' && result.findings.length === 0) ||
          (result.decision !== 'PASS' && result.findings.length > 0),
        detail: 'Decision should align with finding presence.',
      },
      {
        key: 'severity_reasonable',
        passed: result.riskLevel !== 'CRITICAL' || highFindings.length > 0,
        detail: 'Critical result should include high or critical findings.',
      },
      {
        key: 'category_present',
        passed: result.findings.every((finding) => finding.category.length > 0),
        detail: 'Every finding should include risk category.',
      },
      {
        key: 'matched_text_accurate',
        passed: matchedTexts.every(
          (text) => evidenceText.includes(text) || result.summary.includes(text),
        ),
        detail: 'matchedText should appear in source evidence or summary.',
      },
      {
        key: 'evidence_relevant',
        passed:
          sample.sourceType !== 'evidence_link' ||
          result.findings.every((finding) => finding.evidenceIds.length > 0),
        detail: 'Evidence samples should keep evidenceIds linked to findings.',
      },
      {
        key: 'rewrite_safe',
        passed:
          sample.sourceType !== 'rewritten_posting' ||
          result.compliantRewrite === null ||
          !riskyRewriteTerms.some((term) => result.compliantRewrite?.includes(term)),
        detail: 'Rewritten posting should not contain known high-risk terms.',
      },
    ];
    return checks;
  }

  private reviewChecks(ticket: HumanReviewTicket): QaInspectionResult['checks'] {
    return [
      {
        key: 'review_has_feedback',
        passed: ticket.feedback !== undefined,
        detail: 'Completed QA review should include human feedback.',
      },
      {
        key: 'review_sop_consistent',
        passed:
          ticket.feedback === undefined ||
          (ticket.feedback.reviewerId.length > 0 &&
            ticket.feedback.finalDecision.length > 0 &&
            ticket.feedback.comment.trim().length > 0),
        detail: 'Human review should include reviewer, final decision and comment.',
      },
    ];
  }

  private appealChecks(appeal: AppealCaseDetail): QaInspectionResult['checks'] {
    return [
      {
        key: 'appeal_has_agent_report',
        passed: appeal.agentReport !== undefined,
        detail: 'Appeal case should include an Appeal Agent report before QA closure.',
      },
      {
        key: 'appeal_report_balanced',
        passed:
          appeal.agentReport === undefined ||
          (appeal.agentReport.maintainReasons.length > 0 &&
            appeal.agentReport.overturnReasons.length > 0),
        detail: 'Appeal Agent report should include both maintain and overturn reasons.',
      },
      {
        key: 'appeal_has_human_review_result',
        passed: appeal.reviewResult !== undefined || appeal.status !== 'resolved',
        detail: 'Resolved appeal case should include a human review result.',
      },
    ];
  }

  private issuesFromResult(result: QaInspectionResult): QaQualityIssue[] {
    const sample = this.samples.get(result.sampleId);
    if (sample === undefined) return [];
    return result.checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: `qa_issue_${randomUUID()}`,
        jobId: result.jobId,
        sampleId: sample.id,
        tenantId: sample.tenantId,
        sourceType: sample.sourceType,
        sourceId: sample.sourceId,
        issueType: issueTypeForCheck(check.key),
        severity: severityForCheck(check.key),
        description: check.detail,
        status: 'open',
        createdAt: nowIso(),
      }));
  }

  private async addIssueToEval(issue: QaQualityIssue, datasetId: string): Promise<string | undefined> {
    const sample = this.samples.get(issue.sampleId);
    const auditRunId = sample?.auditRunId ?? issue.sourceId;
    const audit = await this.dependencies.auditRunStore.findById(auditRunId, issue.tenantId);
    if (audit === undefined) return undefined;
    await this.dependencies.evalStore.createDataset({
      id: datasetId,
      name: 'QA Failed Samples',
      version: 'v1',
      description: 'Samples converted from QA quality issues.',
    });
    const caseId = `case_from_qa_${issue.id}`;
    await this.dependencies.evalStore.addCases(datasetId, [
      normalizeEvalCase({
        id: caseId,
        datasetId,
        source: 'qa_inspection',
        title: `QA issue ${issue.id}`,
        description: audit.summary,
        expectedDecision: audit.decision,
        expectedCategories: [...new Set(audit.findings.map((finding) => finding.category))] as RiskCategory[],
        expectedSeverity: audit.riskLevel,
        humanReason: issue.description,
        metadata: {
          qaIssueId: issue.id,
          auditRunId: audit.auditId,
          issueType: issue.issueType,
        },
      }),
    ]);
    return caseId;
  }

  private async createRuleSuggestion(
    issue: QaQualityIssue,
    createdBy: string,
  ): Promise<string | undefined> {
    const sample = this.samples.get(issue.sampleId);
    const directTicket = await this.dependencies.reviewStore.findById(issue.sourceId);
    const reviewTicket =
      directTicket ??
      (sample?.auditRunId === undefined
        ? undefined
        : (
            await this.dependencies.reviewStore.list({
              status: 'all',
              tenantId: issue.tenantId,
            })
          ).find((ticket) => ticket.auditRunId === sample.auditRunId));
    if (reviewTicket !== undefined) {
      const suggestion = await this.dependencies.reviewStore.createRuleSuggestion({
        reviewTicketId: reviewTicket.id,
        createdBy,
        title: `QA issue ${issue.issueType}`,
        description: issue.description,
      });
      return suggestion?.id;
    }
    return undefined;
  }
}

function issueTypeForCheck(key: string): QaQualityIssue['issueType'] {
  if (key === 'decision_reasonable') return 'WRONG_DECISION';
  if (key === 'category_present') return 'WRONG_CATEGORY';
  if (key === 'severity_reasonable') return 'WRONG_SEVERITY';
  if (key === 'matched_text_accurate') return 'BAD_MATCHED_TEXT';
  if (key === 'evidence_relevant') return 'IRRELEVANT_EVIDENCE';
  if (key === 'rewrite_safe') return 'UNSAFE_REWRITE';
  if (key.startsWith('review_')) return 'SOP_INCONSISTENT_REVIEW';
  if (key.startsWith('appeal_')) return 'APPEAL_HANDLING_RISK';
  return 'APPEAL_HANDLING_RISK';
}

function severityForCheck(key: string): QaIssueSeverity {
  if (key === 'decision_reasonable' || key === 'rewrite_safe') return 'high';
  if (key === 'evidence_relevant' || key === 'matched_text_accurate') return 'medium';
  return 'low';
}
