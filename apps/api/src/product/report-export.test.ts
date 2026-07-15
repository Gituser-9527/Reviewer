import { describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { exportAuditResultCsv, exportAuditResultMarkdown, exportAuditResultPdf } from './report-export.js';

const result: AuditResult = {
  auditId: 'audit_export_001',
  decision: 'MANUAL_REVIEW',
  riskLevel: 'HIGH',
  summary: '请联系 13812345678 补充岗位信息。',
  findings: [{
    id: 'finding_001', category: 'PRIVACY', severity: 'HIGH', decision: 'MANUAL_REVIEW', title: '个人信息收集风险',
    message: '原文包含身份证号 110101199001011234。', evidence: [], evidenceIds: [], ruleId: 'CN_PRIVACY_001',
    suggestion: '删除不必要的联系方式。', metadata: { matchedText: '手机号 13812345678' },
  }],
  evidence: [], suggestions: [], compliantRewrite: null,
  context: { auditId: 'audit_export_001', tenantId: 'tenant_export', requestId: 'request_export', jurisdiction: 'CN_MAINLAND', locale: 'zh-CN', platform: 'DEFAULT', ruleVersion: 'rules-2026.07', lawKbVersion: 'laws-2026.07', modelVersion: 'mock-none', evaluatedAt: '2026-07-13T00:00:00.000Z' },
  checkerResults: [], createdAt: '2026-07-13T00:00:00.000Z',
};

describe('audit report export', () => {
  it('renders bilingual Markdown, CSV and CJK PDF without unredacted sensitive text', () => {
    const markdown = exportAuditResultMarkdown(result, { locale: 'zh-CN', brand: { displayName: '示例企业' } });
    const csv = exportAuditResultCsv(result, { locale: 'en-US' });
    const pdf = exportAuditResultPdf(result, { locale: 'zh-CN' });

    expect(markdown).toContain('招聘岗位合规审核报告');
    expect(csv).toContain('auditId');
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    for (const output of [markdown, csv, pdf.toString('binary')]) {
      expect(output).not.toContain('13812345678');
      expect(output).not.toContain('110101199001011234');
    }
  });
});
