import { describe, expect, it } from 'vitest';
import type { AuditResult, Finding } from '@job-compliance/shared';
import { getMatchedTexts, getRiskScore } from './audit-view-model';

const result = {
  riskLevel: 'HIGH',
} as AuditResult;

describe('audit view model', () => {
  it('uses a level conversion when the API has no score yet', () => {
    expect(getRiskScore(result)).toEqual({ value: 75, isEstimated: true });
  });

  it('prefers and bounds a future API risk score', () => {
    expect(getRiskScore({ ...result, riskScore: 107 } as AuditResult)).toEqual({
      value: 100,
      isEstimated: false,
    });
  });

  it('deduplicates matched text from metadata and evidence', () => {
    const finding = {
      id: 'finding-1',
      category: 'DISCRIMINATION',
      severity: 'HIGH',
      decision: 'MANUAL_REVIEW',
      title: '性别限制',
      message: '岗位包含与履职无关的性别限制。',
      metadata: { matchedText: ['限女性', '已婚已育优先'] },
      evidence: [
        {
          id: 'evidence-1',
          title: '岗位原文',
          sourceType: 'JOB_TEXT',
          url: 'urn:test:job',
          version: 'submitted',
          quote: '限女性',
        },
        {
          id: 'evidence-2',
          title: '岗位原文',
          sourceType: 'JOB_TEXT',
          url: 'urn:test:job',
          version: 'submitted',
          quote: '服装费',
        },
      ],
      evidenceIds: ['evidence-1', 'evidence-2'],
    } satisfies Finding;

    expect(getMatchedTexts(finding)).toEqual(['限女性', '已婚已育优先', '服装费']);
  });
});
