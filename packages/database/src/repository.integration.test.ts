import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import { PostgresAuditRunRepository } from './repository.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(testDatabaseUrl === undefined)('PostgresAuditRunRepository integration', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const repository = new PostgresAuditRunRepository({ pool });
  const tenantId = `tenant_test_${Date.now()}`;
  const auditId = `audit_test_${Date.now()}`;

  const jobPosting: JobPostingInput = {
    externalId: `job_test_${Date.now()}`,
    title: '行政专员',
    description: '入职需缴纳500元服装费',
    companyName: '测试科技有限公司',
  };

  const result: AuditResult = {
    auditId,
    decision: 'REJECT',
    severity: 'CRITICAL',
    riskLevel: 'CRITICAL',
    summary: '发现 1 个风险项，建议处置为 REJECT。',
    findings: [
      {
        id: 'finding_test_001',
        category: 'FEE_DEPOSIT',
        severity: 'CRITICAL',
        decision: 'REJECT',
        title: 'CN_FEE_DEPOSIT_001',
        message: '岗位疑似要求劳动者提供担保或以其他名义收取财物。',
        evidence: [
          {
            id: 'evidence_test_001',
            title: '岗位原文',
            sourceType: 'JOB_TEXT',
            url: 'job://description',
            version: 'input',
            quote: '入职需缴纳500元服装费',
          },
        ],
        evidenceIds: ['evidence_test_001'],
        ruleId: 'CN_FEE_DEPOSIT_001',
        evidenceId: 'evidence_test_001',
      },
    ],
    evidence: [],
    suggestions: ['删除入职前收费相关内容。'],
    compliantRewrite: null,
    context: {
      auditId,
      tenantId,
      requestId: 'request_test_001',
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-2026-06-12',
      evaluatedAt: '2026-06-17T00:00:00.000Z',
    },
    checkerResults: [],
    createdAt: '2026-06-17T00:00:00.000Z',
  };

  beforeAll(async () => {
    const migrationPath = fileURLToPath(new URL('../migrations/0001_initial.sql', import.meta.url));
    await pool.query(await readFile(resolve(migrationPath), 'utf8'));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM audit_runs WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM job_postings WHERE tenant_id = $1', [tenantId]);
    await repository.close();
    await pool.end();
  });

  it('persists and retrieves a completed audit run', async () => {
    await repository.saveAuditRun({ tenantId, jobPosting, result });

    await expect(repository.findAuditRunById(auditId, tenantId)).resolves.toMatchObject({
      auditId,
      decision: 'REJECT',
      riskLevel: 'CRITICAL',
    });
    await expect(repository.listAuditRuns({ tenantId })).resolves.toEqual([
      expect.objectContaining({ auditId }),
    ]);
  });
});
