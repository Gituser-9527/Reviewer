import { describe, expect, it } from 'vitest';
import type { AuditResult, JobPostingInput } from '@job-compliance/shared';
import { createAuditRunPersistenceModel } from './persistence-model.js';
import { createInputHash, redactSensitiveText } from './privacy.js';

const jobPosting: JobPostingInput = {
  externalId: 'job_001',
  title: '行政专员',
  description:
    '负责办公室行政工作，联系号码 13800000000，身份证 110101199001011234，银行卡 6222020202020202020。',
  companyName: '某某科技有限公司',
  location: '北京',
  employmentType: 'FULL_TIME',
  salary: {
    text: '8k-15k',
  },
};

const auditResult: AuditResult = {
  auditId: 'audit_001',
  decision: 'REJECT',
  severity: 'CRITICAL',
  riskLevel: 'CRITICAL',
  summary: '存在收费风险，建议拦截。',
  findings: [
    {
      id: 'finding_001',
      category: 'FEE_DEPOSIT',
      severity: 'CRITICAL',
      decision: 'REJECT',
      title: 'CN_FEE_DEPOSIT_001',
      message: '岗位疑似要求劳动者提供担保或以其他名义收取财物。',
      evidence: [
        {
          id: 'evidence_001',
          title: '岗位原文',
          sourceType: 'JOB_TEXT',
          url: 'job://description',
          version: 'input',
          quote: '联系号码 13800000000',
        },
      ],
      evidenceIds: ['evidence_001'],
      ruleId: 'CN_FEE_DEPOSIT_001',
      evidenceId: 'evidence_001',
      suggestion: '删除收费相关内容。',
    },
  ],
  evidence: [
    {
      id: 'evidence_001',
      title: '岗位原文',
      sourceType: 'JOB_TEXT',
      url: 'job://description',
      version: 'input',
      quote: '联系号码 13800000000',
    },
  ],
  suggestions: ['删除收费相关内容。'],
  compliantRewrite: null,
  context: {
    auditId: 'audit_001',
    tenantId: 'tenant_001',
    requestId: 'request_001',
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

describe('database persistence privacy helpers', () => {
  it('redacts phone, ID card and bank-card-like values', () => {
    const redacted = redactSensitiveText(
      '手机 13800000000，证件 110101199001011234，卡号 6222020202020202020',
    );

    expect(redacted).toContain('138****0000');
    expect(redacted).toContain('110101********1234');
    expect(redacted).toContain('6222***********2020');
    expect(redacted).not.toContain('13800000000');
    expect(redacted).not.toContain('110101199001011234');
    expect(redacted).not.toContain('6222020202020202020');
  });

  it('creates stable input hashes independent of object key order', () => {
    const left = createInputHash({ title: '行政专员', metadata: { b: 2, a: 1 } });
    const right = createInputHash({ metadata: { a: 1, b: 2 }, title: '行政专员' });

    expect(left).toBe(right);
    expect(left).toHaveLength(64);
  });
});

describe('createAuditRunPersistenceModel', () => {
  it('builds redacted rows for audit run, findings and evidence links', () => {
    const model = createAuditRunPersistenceModel({
      tenantId: 'tenant_001',
      jobPosting,
      result: auditResult,
    });

    expect(model.jobPosting.inputHash).toHaveLength(64);
    expect(model.jobPosting.rawTextRedacted).not.toContain('13800000000');
    expect(model.jobPosting.rawTextRedacted).not.toContain('110101199001011234');
    expect(model.jobPosting.inputPayload.description).toContain('138****0000');
    expect(model.auditRun.resultPayload.findings[0]?.evidence[0]?.quote).toContain('138****0000');
    expect(model.auditRun.ruleVersion).toBe('1.0.0');
    expect(model.auditRun.lawKbVersion).toBe('local-2026-06-12');
    expect(model.findings).toHaveLength(1);
    expect(model.findings[0]).toMatchObject({
      auditRunId: 'audit_001',
      tenantId: 'tenant_001',
      ruleId: 'CN_FEE_DEPOSIT_001',
    });
    expect(model.evidenceLinks).toHaveLength(1);
    expect(model.evidenceLinks[0]).toMatchObject({
      auditRunId: 'audit_001',
      findingId: 'finding_001',
      evidenceId: 'evidence_001',
    });
  });
});
