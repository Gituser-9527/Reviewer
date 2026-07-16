export interface PostgresQueryResult<Row> {
  rowCount: number | null;
  rows: Row[];
}

export interface PostgresQueryExecutor {
  query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>>;
}

export type AuditEnrichmentContextErrorCode =
  | 'AUDIT_RUN_NOT_FOUND'
  | 'ORIGINAL_JOB_POSTING_MISSING'
  | 'AUDIT_RUN_JOB_POSTING_CONTEXT_MISMATCH'
  | 'FINDING_EVIDENCE_NOT_FOUND'
  | 'AUDIT_EVIDENCE_CONTEXT_MISMATCH';

export class AuditEnrichmentContextError extends Error {
  constructor(public readonly code: AuditEnrichmentContextErrorCode) {
    super(code);
    this.name = 'AuditEnrichmentContextError';
  }
}

export interface AuditEnrichmentContext {
  tenantId: string;
  auditRunId: string;
  jurisdiction: string;
  ruleVersion: string;
  decision: string;
  riskLevel: string;
  language: string;
  originalJob: {
    title?: string;
    companyName?: string;
    location?: string;
    salary?: string;
    employmentType?: string;
    description: string;
  };
  findings: Array<{
    id: string;
    ruleId?: string;
    category: string;
    severity: string;
    title: string;
    matchedText?: string;
    recommendation?: string;
    evidenceIds: string[];
  }>;
  evidence: Array<{
    id: string;
    type: string;
    source?: string;
    excerpt?: string;
    ruleId?: string;
  }>;
}

interface AuditRunRow extends Record<string, unknown> {
  id: string;
  job_posting_id: string;
  decision: string;
  risk_level: string;
  rule_version: string;
  result_payload: { context?: { jurisdiction?: unknown } } | null;
}

interface JobPostingRow extends Record<string, unknown> {
  title: string | null;
  company_name: string | null;
  location: string | null;
  salary_text: string | null;
  employment_type: string | null;
  input_payload: { description?: unknown; language?: unknown } | null;
}

interface FindingRow extends Record<string, unknown> {
  finding_id: string;
  rule_id: string | null;
  category: string;
  severity: string;
  title: string;
  message: string | null;
  suggestion: string | null;
  evidence_id: string | null;
  payload: { metadata?: { matchedText?: unknown } } | null;
}

interface EvidenceLinkRow extends Record<string, unknown> {
  evidence_id: string;
  finding_id: string | null;
  source_type: string;
  title: string | null;
  quote_redacted: string | null;
}

/**
 * Loads the persisted audit context required by enrichment. Every database
 * query is tenant-scoped; it deliberately never reads job content from an
 * async-job payload or a worker fixture.
 */
export class PostgresAuditEnrichmentContextLoader {
  constructor(private readonly database: PostgresQueryExecutor) {}

  async load(input: { tenantId: string; auditRunId: string }): Promise<AuditEnrichmentContext> {
    const auditRun = await this.database.query<AuditRunRow>(
      `SELECT id, job_posting_id, decision, risk_level, rule_version, result_payload
         FROM audit_runs
        WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.auditRunId],
    );
    const run = auditRun.rows[0];
    if (!run) throw new AuditEnrichmentContextError('AUDIT_RUN_NOT_FOUND');
    const jobPosting = await this.database.query<JobPostingRow>(
      `SELECT title, company_name, location, salary_text, employment_type, input_payload
         FROM job_postings
        WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, run.job_posting_id],
    );
    const job = jobPosting.rows[0];
    if (!job) {
      throw new AuditEnrichmentContextError('AUDIT_RUN_JOB_POSTING_CONTEXT_MISMATCH');
    }

    const payload = job.input_payload;
    if (!payload || typeof payload.description !== 'string' || payload.description.length === 0) {
      throw new AuditEnrichmentContextError('ORIGINAL_JOB_POSTING_MISSING');
    }

    const findings = await this.database.query<FindingRow>(
      `SELECT finding_id, rule_id, category, severity, title, message, suggestion, evidence_id, payload
         FROM audit_findings
        WHERE tenant_id = $1 AND audit_run_id = $2`,
      [input.tenantId, input.auditRunId],
    );
    const findingIds = new Set(findings.rows.map((finding) => finding.finding_id));

    const evidenceLinks = await this.database.query<EvidenceLinkRow>(
      `SELECT evidence_id, finding_id, source_type, title, quote_redacted
         FROM audit_evidence_links
        WHERE tenant_id = $1 AND audit_run_id = $2`,
      [input.tenantId, input.auditRunId],
    );
    for (const evidence of evidenceLinks.rows) {
      if (evidence.finding_id !== null && !findingIds.has(evidence.finding_id)) {
        throw new AuditEnrichmentContextError('AUDIT_EVIDENCE_CONTEXT_MISMATCH');
      }
    }

    const evidenceIds = new Set(evidenceLinks.rows.map((evidence) => evidence.evidence_id));
    for (const finding of findings.rows) {
      if (finding.evidence_id !== null && !evidenceIds.has(finding.evidence_id)) {
        throw new AuditEnrichmentContextError('FINDING_EVIDENCE_NOT_FOUND');
      }
    }

    const linkedEvidenceByFinding = new Map<string, string[]>();
    for (const evidence of evidenceLinks.rows) {
      if (evidence.finding_id === null) continue;
      const ids = linkedEvidenceByFinding.get(evidence.finding_id) ?? [];
      ids.push(evidence.evidence_id);
      linkedEvidenceByFinding.set(evidence.finding_id, ids);
    }

    return {
      tenantId: input.tenantId,
      auditRunId: input.auditRunId,
      jurisdiction:
        typeof run.result_payload?.context?.jurisdiction === 'string'
          ? run.result_payload.context.jurisdiction
          : 'CN_MAINLAND',
      ruleVersion: run.rule_version,
      decision: run.decision,
      riskLevel: run.risk_level,
      language: typeof payload.language === 'string' ? payload.language : 'zh-CN',
      originalJob: {
        ...(job.title === null ? {} : { title: job.title }),
        ...(job.company_name === null ? {} : { companyName: job.company_name }),
        ...(job.location === null ? {} : { location: job.location }),
        ...(job.salary_text === null ? {} : { salary: job.salary_text }),
        ...(job.employment_type === null ? {} : { employmentType: job.employment_type }),
        description: payload.description,
      },
      findings: findings.rows.map((finding) => {
        const text = matchedText(finding);
        return {
          id: finding.finding_id,
          ...(finding.rule_id === null ? {} : { ruleId: finding.rule_id }),
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          ...(text === undefined ? {} : { matchedText: text }),
          ...(finding.suggestion === null ? {} : { recommendation: finding.suggestion }),
          evidenceIds: [
            ...new Set([
              ...(finding.evidence_id === null ? [] : [finding.evidence_id]),
              ...(linkedEvidenceByFinding.get(finding.finding_id) ?? []),
            ]),
          ],
        };
      }),
      evidence: evidenceLinks.rows.map((evidence) => ({
        id: evidence.evidence_id,
        type: evidence.source_type,
        ...(evidence.title === null ? {} : { source: evidence.title }),
        ...(evidence.quote_redacted === null ? {} : { excerpt: evidence.quote_redacted }),
      })),
    };
  }
}

function matchedText(finding: FindingRow): string | undefined {
  const candidate = finding.payload?.metadata?.matchedText;
  if (Array.isArray(candidate)) {
    const values = candidate.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    return values.length === 1 ? values[0] : values.length > 1 ? values.join('\n') : undefined;
  }
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  return finding.message === null || finding.message.length === 0 ? undefined : finding.message;
}
