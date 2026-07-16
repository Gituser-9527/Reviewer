import { describe, expect, it } from 'vitest';
import {
  PostgresAuditEnrichmentContextLoader,
  type AuditEnrichmentContextError,
  type PostgresQueryExecutor,
} from './enrichment-context-loader.js';

type Row = Record<string, unknown>;

function queryExecutor(rows: Row[][]): PostgresQueryExecutor {
  let index = 0;
  return {
    async query(text, values) {
      expect(values[0]).toBe('tenant-a');
      expect(text).toContain('tenant_id = $1');
      const result = rows[index++] ?? [];
      return { rowCount: result.length, rows: result };
    },
  };
}

const auditRun = { id: 'audit-a', job_posting_id: 'job-a', decision: 'REVIEW', risk_level: 'HIGH' };
const jobPosting = {
  title: '招聘专员',
  company_name: '示例企业',
  location: '上海',
  salary_text: '10k-15k',
  employment_type: 'FULL_TIME',
  input_payload: { description: '仅限男性应聘。', language: 'zh-CN' },
};
const finding = {
  finding_id: 'finding-a',
  rule_id: 'rule-gender',
  category: 'DISCRIMINATION',
  severity: 'HIGH',
  title: '性别限制',
  message: '仅限男性',
  suggestion: '删除性别限制',
  evidence_id: 'evidence-a',
};
const evidence = {
  evidence_id: 'evidence-a',
  finding_id: 'finding-a',
  source_type: 'RULE',
  title: '平台规则',
  quote_redacted: '不得设置无关性别限制',
};

describe('PostgresAuditEnrichmentContextLoader', () => {
  it('loads a tenant-scoped job, audit result, findings, and evidence references', async () => {
    const loader = new PostgresAuditEnrichmentContextLoader(
      queryExecutor([[auditRun], [jobPosting], [finding], [evidence]]),
    );

    await expect(
      loader.load({ tenantId: 'tenant-a', auditRunId: 'audit-a' }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-a',
      auditRunId: 'audit-a',
      decision: 'REVIEW',
      riskLevel: 'HIGH',
      originalJob: { description: '仅限男性应聘。', companyName: '示例企业' },
      findings: [{ id: 'finding-a', evidenceIds: ['evidence-a'] }],
      evidence: [{ id: 'evidence-a', type: 'RULE' }],
    });
  });

  it('returns an empty findings array when the audit has no findings', async () => {
    const loader = new PostgresAuditEnrichmentContextLoader(
      queryExecutor([[auditRun], [jobPosting], [], []]),
    );

    await expect(
      loader.load({ tenantId: 'tenant-a', auditRunId: 'audit-a' }),
    ).resolves.toMatchObject({
      findings: [],
      evidence: [],
    });
  });

  it.each([
    ['AUDIT_RUN_NOT_FOUND', [[]]],
    ['ORIGINAL_JOB_POSTING_MISSING', [[auditRun], [{ ...jobPosting, input_payload: {} }]]],
    ['AUDIT_RUN_JOB_POSTING_CONTEXT_MISMATCH', [[auditRun], []]],
    ['FINDING_EVIDENCE_NOT_FOUND', [[auditRun], [jobPosting], [finding], []]],
    [
      'AUDIT_EVIDENCE_CONTEXT_MISMATCH',
      [[auditRun], [jobPosting], [finding], [{ ...evidence, finding_id: 'other-finding' }]],
    ],
  ])('fails with %s for inconsistent persisted context', async (code, rows) => {
    const loader = new PostgresAuditEnrichmentContextLoader(queryExecutor(rows));

    await expect(
      loader.load({ tenantId: 'tenant-a', auditRunId: 'audit-a' }),
    ).rejects.toMatchObject({
      code,
    } satisfies Partial<AuditEnrichmentContextError>);
  });

  it('does not load an audit run from another tenant', async () => {
    const loader = new PostgresAuditEnrichmentContextLoader(queryExecutor([[]]));

    await expect(
      loader.load({ tenantId: 'tenant-a', auditRunId: 'audit-other-tenant' }),
    ).rejects.toMatchObject({
      code: 'AUDIT_RUN_NOT_FOUND',
    });
  });
});
