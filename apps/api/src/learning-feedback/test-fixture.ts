import type { HumanReviewTicket } from '@job-compliance/shared';

export const ticket: HumanReviewTicket = {
  id: 'review-1', auditRunId: 'audit-1', tenantId: 'tenant-a', status: 'completed', findings: [], riskLevel: 'HIGH', suggestedAction: 'MANUAL_REVIEW', agentDecision: 'MANUAL_REVIEW', summary: 'summary', createdAt: '2026-01-01T00:00:00.000Z',
  auditResult: { auditId: 'audit-1', decision: 'MANUAL_REVIEW', riskLevel: 'HIGH', summary: 'summary', findings: [], evidence: [], suggestions: [], compliantRewrite: null, checkerResults: [], createdAt: '2026-01-01T00:00:00.000Z', context: { auditId: 'audit-1', tenantId: 'tenant-a', requestId: 'request-1', jurisdiction: 'CN', locale: 'zh-CN', platform: 'local', ruleVersion: 'rules-v1', lawKbVersion: 'kb-v1', evaluatedAt: '2026-01-01T00:00:00.000Z' } },
  feedback: { id: '00000000-0000-4000-8000-000000000001', reviewerId: 'reviewer-a', agentDecision: 'MANUAL_REVIEW', finalDecision: 'REJECT', feedbackType: 'FALSE_NEGATIVE', comment: '', falsePositive: false, falseNegative: true, createdAt: '2026-01-01T00:00:00.000Z' },
};
