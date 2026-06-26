import type { AuditResult, Evidence, Finding, JobPostingInput } from '@job-compliance/shared';
import { createInputHash, redactJson, redactSensitiveText } from './privacy.js';

/** Input required to persist a completed audit run. */
export interface PersistAuditRunInput {
  /** Tenant that owns the job posting and audit run. */
  tenantId: string;
  /** Job posting used to produce the audit result. */
  jobPosting: JobPostingInput;
  /** Completed audit result returned by the orchestrator. */
  result: AuditResult;
}

/** Normalized persistence projection for one completed audit run. */
export interface AuditRunPersistenceModel {
  /** Redacted job posting row fields. */
  jobPosting: {
    tenantId: string;
    externalId?: string;
    title: string;
    companyName?: string;
    location?: string;
    employmentType?: string;
    salaryText?: string;
    rawTextRedacted: string;
    inputHash: string;
    inputPayload: JobPostingInput;
  };
  /** Redacted audit run row fields. */
  auditRun: {
    id: string;
    tenantId: string;
    decision: string;
    riskLevel: string;
    summary: string;
    ruleVersion: string;
    lawKbVersion: string;
    modelVersion?: string;
    inputHash: string;
    resultPayload: AuditResult;
    evaluatedAt: Date;
    createdAt: Date;
  };
  /** Redacted finding rows. */
  findings: Array<{
    auditRunId: string;
    findingId: string;
    tenantId: string;
    category: string;
    severity: string;
    decision: string;
    ruleId?: string;
    evidenceId?: string;
    title: string;
    message: string;
    suggestion?: string;
    payload: Finding;
  }>;
  /** Redacted evidence link rows. */
  evidenceLinks: Array<{
    auditRunId: string;
    findingId?: string;
    tenantId: string;
    evidenceId: string;
    sourceType: string;
    title: string;
    url: string;
    version: string;
    quoteRedacted?: string;
    payload: Evidence;
  }>;
}

/** Builds the raw text snapshot used for hashing and redacted persistence. */
export function composeJobPostingRawText(input: JobPostingInput): string {
  const sections = [input.title, input.description];
  if (input.responsibilities?.length) {
    sections.push(`岗位职责:\n${input.responsibilities.join('\n')}`);
  }
  if (input.requirements?.length) {
    sections.push(`任职要求:\n${input.requirements.join('\n')}`);
  }
  if (input.companyName) sections.push(`公司名称:${input.companyName}`);
  if (input.location) sections.push(`工作地点:${input.location}`);
  if (input.employmentType) sections.push(`工作性质:${input.employmentType}`);
  if (input.salary?.text) sections.push(`薪资:${input.salary.text}`);
  return sections.join('\n');
}

function dateFromIso(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp for audit persistence: ${value}`);
  }
  return date;
}

/** Converts an audit result into redacted relational rows without touching the database. */
export function createAuditRunPersistenceModel(
  input: PersistAuditRunInput,
): AuditRunPersistenceModel {
  const rawText = composeJobPostingRawText(input.jobPosting);
  const inputHash = createInputHash(input.jobPosting);
  const redactedJobPosting = redactJson(input.jobPosting);
  const redactedResult = redactJson(input.result);
  const tenantId = input.tenantId;

  const findings = redactedResult.findings.map((finding) => ({
    auditRunId: redactedResult.auditId,
    findingId: finding.id,
    tenantId,
    category: finding.category,
    severity: finding.severity,
    decision: finding.decision,
    ...(finding.ruleId === undefined ? {} : { ruleId: finding.ruleId }),
    ...(finding.evidenceId === undefined ? {} : { evidenceId: finding.evidenceId }),
    title: finding.title,
    message: finding.message,
    ...(finding.suggestion === undefined ? {} : { suggestion: finding.suggestion }),
    payload: finding,
  }));

  const evidenceLinks = redactedResult.findings.flatMap((finding) =>
    finding.evidence.map((evidence) => ({
      auditRunId: redactedResult.auditId,
      findingId: finding.id,
      tenantId,
      evidenceId: evidence.id,
      sourceType: evidence.sourceType,
      title: evidence.title,
      url: evidence.url,
      version: evidence.version,
      ...(evidence.quote === undefined ? {} : { quoteRedacted: evidence.quote }),
      payload: evidence,
    })),
  );

  return {
    jobPosting: {
      tenantId,
      ...(redactedJobPosting.externalId === undefined
        ? {}
        : { externalId: redactedJobPosting.externalId }),
      title: redactedJobPosting.title,
      ...(redactedJobPosting.companyName === undefined
        ? {}
        : { companyName: redactedJobPosting.companyName }),
      ...(redactedJobPosting.location === undefined ? {} : { location: redactedJobPosting.location }),
      ...(redactedJobPosting.employmentType === undefined
        ? {}
        : { employmentType: redactedJobPosting.employmentType }),
      ...(redactedJobPosting.salary?.text === undefined
        ? {}
        : { salaryText: redactedJobPosting.salary.text }),
      rawTextRedacted: redactSensitiveText(rawText),
      inputHash,
      inputPayload: redactedJobPosting,
    },
    auditRun: {
      id: redactedResult.auditId,
      tenantId,
      decision: redactedResult.decision,
      riskLevel: redactedResult.riskLevel,
      summary: redactedResult.summary,
      ruleVersion: redactedResult.context.ruleVersion,
      lawKbVersion: redactedResult.context.lawKbVersion,
      ...(redactedResult.context.modelVersion === undefined
        ? {}
        : { modelVersion: redactedResult.context.modelVersion }),
      inputHash,
      resultPayload: redactedResult,
      evaluatedAt: dateFromIso(redactedResult.context.evaluatedAt),
      createdAt: dateFromIso(redactedResult.createdAt),
    },
    findings,
    evidenceLinks,
  };
}
