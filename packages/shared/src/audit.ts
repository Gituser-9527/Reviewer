import { createRuntimeSchema, type ValidationIssue } from './schema.js';

/** Supported externally visible audit decisions. */
export const auditDecisions = [
  'PASS',
  'REJECT',
  'MANUAL_REVIEW',
  'ALLOW_WITH_WARNING',
  'NEED_MORE_INFO',
] as const;

/** Final or intermediate decision returned by the audit contract. */
export type AuditDecision = (typeof auditDecisions)[number];

/** Supported compliance risk categories. */
export const riskCategories = [
  'DISCRIMINATION',
  'FEE_DEPOSIT',
  'PRIVACY',
  'FALSE_OR_MISLEADING',
  'INCOMPLETE_INFORMATION',
  'LABOR_CONTRACT_RISK',
  'PLATFORM_POLICY',
  'OTHER',
] as const;

/** Category assigned to a compliance risk. */
export type RiskCategory = (typeof riskCategories)[number];

/** Supported severity levels for findings and checker results. */
export const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Impact level assigned to an identified risk. */
export type Severity = (typeof severities)[number];

/** Salary information supplied with a job posting. */
export interface JobSalaryInput {
  /** Original salary text shown to job seekers. */
  text?: string;
  /** Minimum salary amount, when structurally available. */
  min?: number;
  /** Maximum salary amount, when structurally available. */
  max?: number;
  /** ISO 4217 currency code, such as CNY. */
  currency?: string;
  /** Salary period, such as HOUR, MONTH, or YEAR. */
  period?: string;
}

/** Raw job posting accepted by the audit boundary. */
export interface JobPostingInput {
  /** Client-defined identifier used to correlate the posting. */
  externalId?: string;
  /** Public job title. */
  title: string;
  /** Complete original job description. */
  description: string;
  /** Structured responsibility statements, when provided. */
  responsibilities?: string[];
  /** Structured candidate requirements, when provided. */
  requirements?: string[];
  /** Work location as supplied by the publisher. */
  location?: string;
  /** Employment type, such as FULL_TIME or PART_TIME. */
  employmentType?: string;
  /** Salary information supplied by the publisher. */
  salary?: JobSalaryInput;
  /** Hiring company name, when available to the audit. */
  companyName?: string;
  /** Company or job industry classification. */
  industry?: string;
  /** Platform-specific job category. */
  jobCategory?: string;
  /** Number of planned hires, when stated. */
  headcount?: number;
  /** Additional non-standard input fields retained without interpretation. */
  metadata?: Record<string, unknown>;
}

/** Normalized salary facts extracted from a posting. */
export interface SalaryFacts {
  /** Original salary expression used as evidence. */
  rawText?: string;
  /** Parsed minimum salary amount. */
  min?: number;
  /** Parsed maximum salary amount. */
  max?: number;
  /** Parsed ISO 4217 currency code. */
  currency?: string;
  /** Parsed salary period. */
  period?: string;
}

/** Structured, source-preserving facts extracted from a job posting. */
export interface JobFacts {
  /** Normalized job title extracted from the posting. */
  jobTitle: string;
  /** Normalized company name extracted from the posting. */
  companyName?: string;
  /** Backward-compatible alias of jobTitle. */
  title: string;
  /** Normalized full text used by downstream checkers. */
  normalizedText: string;
  /** Responsibility statements preserved as individual facts. */
  responsibilities: string[];
  /** Candidate requirement statements preserved as individual facts. */
  requirements: string[];
  /** Primary work location extracted from the posting. */
  location?: string;
  /** Work locations explicitly identified in the posting. */
  locations: string[];
  /** Employment type explicitly identified in the posting. */
  employmentType?: string;
  /** Normalized salary facts, when present. */
  salary?: SalaryFacts;
  /** Benefit statements extracted from the posting. */
  benefits: string[];
  /** Potentially sensitive hiring conditions, such as gender or age restrictions. */
  sensitiveConditions: string[];
  /** Fee, deposit, loan, or payment requests extracted from the posting. */
  feesOrDeposit: string[];
  /** Personal-information requests extracted from the posting. */
  personalInfoRequests: string[];
  /** Absolute, ambiguous, or difficult-to-verify claims extracted from the posting. */
  unclearClaims: string[];
  /** Explicit fee, deposit, or payment expressions found in the posting. */
  feeStatements: string[];
  /** Personal-data requests explicitly found in the posting. */
  personalDataRequests: string[];
  /** Required fields that could not be established from the input. */
  missingFields: string[];
  /** Extensible structured facts that have not yet received a stable field. */
  attributes: Record<string, unknown>;
}

/** Source material supporting a finding or audit conclusion. */
export interface Evidence {
  /** Stable evidence identifier. */
  id: string;
  /** Evidence origin, such as JOB_TEXT, RULE, LAW, PLATFORM_POLICY, or MANUAL. */
  sourceType: string;
  /** Source field or document path containing the evidence. */
  fieldPath?: string;
  /** Exact source excerpt, when text evidence is available. */
  quote?: string;
  /** Inclusive start offset within the source field. */
  start?: number;
  /** Exclusive end offset within the source field. */
  end?: number;
  /** Stable identifier of the source document or rule. */
  sourceId?: string;
  /** Human-readable source name. */
  sourceName?: string;
  /** Version of the cited source. */
  sourceVersion?: string;
  /** Date from which the source is effective. */
  effectiveFrom?: string;
  /** Date after which the source is no longer effective. */
  effectiveTo?: string;
  /** Canonical source URL, when one exists. */
  url?: string;
  /** Additional source metadata that does not affect the schema contract. */
  metadata?: Record<string, unknown>;
}

/** A single compliance concern identified during an audit. */
export interface Finding {
  /** Stable finding identifier within the audit. */
  id: string;
  /** Risk category assigned to the finding. */
  category: RiskCategory;
  /** Severity assigned to the finding. */
  severity: Severity;
  /** Recommended audit disposition for this finding. */
  decision: AuditDecision;
  /** Short finding title suitable for a result list. */
  title: string;
  /** Cautious explanation of the identified risk. */
  message: string;
  /** Evidence supporting the finding. */
  evidence: Evidence[];
  /** Rule identifier when the finding originated from a rule. */
  ruleId?: string;
  /** Primary evidence identifier when the finding originated from retrieved evidence. */
  evidenceId?: string;
  /** Checker identifier when the finding originated from a checker. */
  checkerId?: string;
  /** Normalized confidence from 0 to 1, when the producer supplies one. */
  confidence?: number;
  /** Actionable remediation suggestion. */
  suggestion?: string;
  /** Additional producer metadata not used as authoritative evidence. */
  metadata?: Record<string, unknown>;
}

/** Immutable context attached to an audit execution. */
export interface AuditContext {
  /** Unique audit identifier. */
  auditId: string;
  /** Tenant that owns the input and result. */
  tenantId: string;
  /** Request correlation identifier. */
  requestId: string;
  /** Applicable jurisdiction code. */
  jurisdiction: string;
  /** Input locale, such as zh-CN. */
  locale: string;
  /** Platform policy scope. */
  platform: string;
  /** Rule set version used by the audit. */
  ruleVersion: string;
  /** Compliance knowledge-base version used by the audit. */
  lawKbVersion: string;
  /** Prompt version used by semantic checkers, when applicable. */
  promptVersion?: string;
  /** Configured model provider, when a model was used. */
  modelProvider?: string;
  /** Configured model name, when a model was used. */
  modelName?: string;
  /** Configured model version, when a model was used. */
  modelVersion?: string;
  /** Timestamp against which effective dates are evaluated. */
  evaluatedAt: string;
}

/** Result returned by one independently traceable audit checker. */
export interface CheckerResult {
  /** Stable checker identifier. */
  checkerId: string;
  /** Checker implementation or configuration version. */
  checkerVersion: string;
  /** Execution status of the checker. */
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  /** Checker-level decision, when execution produced one. */
  decision?: AuditDecision;
  /** Highest severity produced by the checker. */
  severity?: Severity;
  /** Findings produced by the checker. */
  findings: Finding[];
  /** Evidence retrieved or generated by the checker. */
  evidence: Evidence[];
  /** Human-readable checker summary. */
  summary?: string;
  /** Normalized confidence from 0 to 1, when available. */
  confidence?: number;
  /** Checker execution time in milliseconds. */
  durationMs: number;
  /** Stable error code for failed executions. */
  errorCode?: string;
}

/** Complete externally consumable audit result. */
export interface AuditResult {
  /** Unique audit identifier. */
  auditId: string;
  /** Final audit decision. */
  decision: AuditDecision;
  /** Highest severity represented in the result, when findings exist. */
  severity?: Severity;
  /** Explicit highest risk level returned to API consumers. */
  riskLevel: Severity | 'NONE';
  /** Cautious summary of the audit outcome. */
  summary: string;
  /** All deduplicated findings included in the result. */
  findings: Finding[];
  /** All evidence references included in the result. */
  evidence: Evidence[];
  /** Ordered remediation suggestions. */
  suggestions: string[];
  /** Suggested compliant rewrite, or null when safe rewriting is unavailable. */
  compliantRewrite: string | null;
  /** Immutable execution context and version information. */
  context: AuditContext;
  /** Results from independently traceable checkers. */
  checkerResults: CheckerResult[];
  /** Audit result creation timestamp. */
  createdAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issue = (path: string, message: string): ValidationIssue => ({ path, message });

const validateString = (value: unknown, path: string, required = true): ValidationIssue[] => {
  if (value === undefined && !required) return [];
  return typeof value === 'string' && value.length > 0
    ? []
    : [issue(path, 'expected a non-empty string')];
};

const validateNumber = (value: unknown, path: string, required = true): ValidationIssue[] => {
  if (value === undefined && !required) return [];
  return typeof value === 'number' && Number.isFinite(value)
    ? []
    : [issue(path, 'expected a finite number')];
};

const validateStringArray = (value: unknown, path: string, required = true): ValidationIssue[] => {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) return [issue(path, 'expected an array')];
  return value.flatMap((item, index) => validateString(item, `${path}[${index}]`));
};

const validateEnum = <T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string,
  required = true,
): ValidationIssue[] => {
  if (value === undefined && !required) return [];
  return typeof value === 'string' && values.includes(value)
    ? []
    : [issue(path, `expected one of: ${values.join(', ')}`)];
};

const validateEvidence = (input: unknown, path: string): ValidationIssue[] => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  return [
    ...validateString(input.id, `${path}.id`),
    ...validateString(input.sourceType, `${path}.sourceType`),
    ...validateString(input.fieldPath, `${path}.fieldPath`, false),
    ...validateString(input.quote, `${path}.quote`, false),
    ...validateNumber(input.start, `${path}.start`, false),
    ...validateNumber(input.end, `${path}.end`, false),
  ];
};

const validateFinding = (input: unknown, path: string): ValidationIssue[] => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  const evidenceIssues = Array.isArray(input.evidence)
    ? input.evidence.flatMap((item, index) => validateEvidence(item, `${path}.evidence[${index}]`))
    : [issue(`${path}.evidence`, 'expected an array')];
  const confidenceIssues =
    input.confidence === undefined ||
    (typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1)
      ? []
      : [issue(`${path}.confidence`, 'expected a number between 0 and 1')];
  return [
    ...validateString(input.id, `${path}.id`),
    ...validateEnum(input.category, riskCategories, `${path}.category`),
    ...validateEnum(input.severity, severities, `${path}.severity`),
    ...validateEnum(input.decision, auditDecisions, `${path}.decision`),
    ...validateString(input.title, `${path}.title`),
    ...validateString(input.message, `${path}.message`),
    ...validateString(input.evidenceId, `${path}.evidenceId`, false),
    ...evidenceIssues,
    ...confidenceIssues,
  ];
};

const validateAuditContext = (input: unknown, path: string): ValidationIssue[] => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  return [
    ...validateString(input.auditId, `${path}.auditId`),
    ...validateString(input.tenantId, `${path}.tenantId`),
    ...validateString(input.requestId, `${path}.requestId`),
    ...validateString(input.jurisdiction, `${path}.jurisdiction`),
    ...validateString(input.locale, `${path}.locale`),
    ...validateString(input.platform, `${path}.platform`),
    ...validateString(input.ruleVersion, `${path}.ruleVersion`),
    ...validateString(input.lawKbVersion, `${path}.lawKbVersion`),
    ...validateString(input.evaluatedAt, `${path}.evaluatedAt`),
  ];
};

const validateCheckerResult = (input: unknown, path: string): ValidationIssue[] => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  const findings = Array.isArray(input.findings)
    ? input.findings.flatMap((item, index) => validateFinding(item, `${path}.findings[${index}]`))
    : [issue(`${path}.findings`, 'expected an array')];
  const evidence = Array.isArray(input.evidence)
    ? input.evidence.flatMap((item, index) => validateEvidence(item, `${path}.evidence[${index}]`))
    : [issue(`${path}.evidence`, 'expected an array')];
  return [
    ...validateString(input.checkerId, `${path}.checkerId`),
    ...validateString(input.checkerVersion, `${path}.checkerVersion`),
    ...validateEnum(input.status, ['COMPLETED', 'FAILED', 'SKIPPED'] as const, `${path}.status`),
    ...validateEnum(input.decision, auditDecisions, `${path}.decision`, false),
    ...validateEnum(input.severity, severities, `${path}.severity`, false),
    ...validateNumber(input.durationMs, `${path}.durationMs`),
    ...findings,
    ...evidence,
  ];
};

/** Runtime schema for AuditDecision. */
export const auditDecisionSchema = createRuntimeSchema<AuditDecision>((input, path) =>
  validateEnum(input, auditDecisions, path),
);

/** Runtime schema for RiskCategory. */
export const riskCategorySchema = createRuntimeSchema<RiskCategory>((input, path) =>
  validateEnum(input, riskCategories, path),
);

/** Runtime schema for Severity. */
export const severitySchema = createRuntimeSchema<Severity>((input, path) =>
  validateEnum(input, severities, path),
);

/** Runtime schema for JobPostingInput. */
export const jobPostingInputSchema = createRuntimeSchema<JobPostingInput>((input, path) => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  return [
    ...validateString(input.title, `${path}.title`),
    ...validateString(input.description, `${path}.description`),
    ...validateStringArray(input.responsibilities, `${path}.responsibilities`, false),
    ...validateStringArray(input.requirements, `${path}.requirements`, false),
    ...validateString(input.location, `${path}.location`, false),
    ...validateString(input.employmentType, `${path}.employmentType`, false),
  ];
});

/** Runtime schema for JobFacts. */
export const jobFactsSchema = createRuntimeSchema<JobFacts>((input, path) => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  return [
    ...validateString(input.title, `${path}.title`),
    ...validateString(input.jobTitle, `${path}.jobTitle`),
    ...validateString(input.companyName, `${path}.companyName`, false),
    ...validateString(input.normalizedText, `${path}.normalizedText`),
    ...validateStringArray(input.responsibilities, `${path}.responsibilities`),
    ...validateStringArray(input.requirements, `${path}.requirements`),
    ...validateStringArray(input.locations, `${path}.locations`),
    ...validateString(input.location, `${path}.location`, false),
    ...validateStringArray(input.benefits, `${path}.benefits`),
    ...validateStringArray(input.sensitiveConditions, `${path}.sensitiveConditions`),
    ...validateStringArray(input.feesOrDeposit, `${path}.feesOrDeposit`),
    ...validateStringArray(input.personalInfoRequests, `${path}.personalInfoRequests`),
    ...validateStringArray(input.unclearClaims, `${path}.unclearClaims`),
    ...validateStringArray(input.feeStatements, `${path}.feeStatements`),
    ...validateStringArray(input.personalDataRequests, `${path}.personalDataRequests`),
    ...validateStringArray(input.missingFields, `${path}.missingFields`),
    ...(isRecord(input.attributes) ? [] : [issue(`${path}.attributes`, 'expected an object')]),
  ];
});

/** Runtime schema for Evidence. */
export const evidenceSchema = createRuntimeSchema<Evidence>(validateEvidence);

/** Runtime schema for Finding. */
export const findingSchema = createRuntimeSchema<Finding>(validateFinding);

/** Runtime schema for AuditContext. */
export const auditContextSchema = createRuntimeSchema<AuditContext>(validateAuditContext);

/** Runtime schema for CheckerResult. */
export const checkerResultSchema = createRuntimeSchema<CheckerResult>(validateCheckerResult);

/** Runtime schema for AuditResult. */
export const auditResultSchema = createRuntimeSchema<AuditResult>((input, path) => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  const findings = Array.isArray(input.findings)
    ? input.findings.flatMap((item, index) => validateFinding(item, `${path}.findings[${index}]`))
    : [issue(`${path}.findings`, 'expected an array')];
  const evidence = Array.isArray(input.evidence)
    ? input.evidence.flatMap((item, index) => validateEvidence(item, `${path}.evidence[${index}]`))
    : [issue(`${path}.evidence`, 'expected an array')];
  const checkerResults = Array.isArray(input.checkerResults)
    ? input.checkerResults.flatMap((item, index) =>
        validateCheckerResult(item, `${path}.checkerResults[${index}]`),
      )
    : [issue(`${path}.checkerResults`, 'expected an array')];
  const rewriteIssues =
    input.compliantRewrite === null || typeof input.compliantRewrite === 'string'
      ? []
      : [issue(`${path}.compliantRewrite`, 'expected a string or null')];
  return [
    ...validateString(input.auditId, `${path}.auditId`),
    ...validateEnum(input.decision, auditDecisions, `${path}.decision`),
    ...validateEnum(input.severity, severities, `${path}.severity`, false),
    ...validateEnum(input.riskLevel, ['NONE', ...severities] as const, `${path}.riskLevel`),
    ...validateString(input.summary, `${path}.summary`),
    ...validateStringArray(input.suggestions, `${path}.suggestions`),
    ...validateAuditContext(input.context, `${path}.context`),
    ...validateString(input.createdAt, `${path}.createdAt`),
    ...findings,
    ...evidence,
    ...checkerResults,
    ...rewriteIssues,
  ];
});
