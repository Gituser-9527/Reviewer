import { describe, expect, it } from 'vitest';
import type { AuditResult } from '@job-compliance/shared';
import { InMemoryHumanReviewStore } from './store.js';

function manualReviewResult(): AuditResult {
  return {
    auditId: 'audit_store_manual_001',
    decision: 'MANUAL_REVIEW',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    summary: '发现 1 个风险项，建议人工复核。',
    findings: [
      {
        id: 'finding_store_001',
        category: 'DISCRIMINATION',
        severity: 'HIGH',
        decision: 'MANUAL_REVIEW',
        title: 'CN_DISCRIMINATION_GENDER_001',
        message: '岗位存在疑似就业歧视风险。',
        evidence: [],
        evidenceIds: ['evidence_store_001'],
        ruleId: 'CN_DISCRIMINATION_GENDER_001',
        suggestion: '删除与履职无关的性别限制。',
      },
    ],
    evidence: [],
    suggestions: [],
    compliantRewrite: null,
    context: {
      auditId: 'audit_store_manual_001',
      tenantId: 'tenant_store',
      requestId: 'request_store',
      jurisdiction: 'CN_MAINLAND',
      locale: 'zh-CN',
      platform: 'DEFAULT',
      ruleVersion: '1.0.0',
      lawKbVersion: 'local-test',
      evaluatedAt: '2026-06-22T00:00:00.000Z',
    },
    checkerResults: [],
    createdAt: '2026-06-22T00:00:00.000Z',
  };
}

describe('InMemoryHumanReviewStore', () => {
  it('stores feedback details and rule suggestions with redacted text', () => {
    const store = new InMemoryHumanReviewStore();
    const ticket = store.createFromAuditResult(manualReviewResult(), {
      title: '行政专员',
      description: '联系候选人手机号13812345678，限女性。',
    });

    expect(ticket).toMatchObject({
      id: 'audit_store_manual_001',
      agentDecision: 'MANUAL_REVIEW',
      status: 'pending',
      jobPosting: {
        description: '联系候选人手机号138****5678，限女性。',
      },
    });

    const closed = store.submitDecision('audit_store_manual_001', {
      reviewerId: 'reviewer_store',
      finalDecision: 'REQUEST_REVISION',
      feedbackType: 'RULE_TOO_BROAD',
      comment: '联系我13812345678后再确认。',
      falsePositive: false,
      falseNegative: false,
    });

    expect(closed?.feedback).toMatchObject({
      agentDecision: 'MANUAL_REVIEW',
      finalDecision: 'REQUEST_REVISION',
      feedbackType: 'RULE_TOO_BROAD',
      comment: '联系我138****5678后再确认。',
    });

    const suggestion = store.createRuleSuggestion({
      reviewTicketId: 'audit_store_manual_001',
      createdBy: 'reviewer_store',
      description: '规则建议电话13812345678',
    });

    expect(suggestion).toMatchObject({
      status: 'open',
      feedbackType: 'RULE_TOO_BROAD',
      description: '规则建议电话138****5678',
    });

    const resolved = store.resolveRuleSuggestion(suggestion?.id ?? '', {
      resolvedBy: 'rule_admin',
      resolutionComment: '处理人电话13812345678',
    });

    expect(resolved).toMatchObject({
      status: 'resolved',
      resolvedBy: 'rule_admin',
      resolutionComment: '处理人电话138****5678',
    });
  });
});
