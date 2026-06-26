import { describe, expect, it } from 'vitest';
import type { AuditResult, Evidence, Finding } from '@job-compliance/shared';
import { ReflectionChecker } from './reflection-checker.js';

const baseContext = {
  auditId: 'audit-reflection-001',
  tenantId: 'tenant-001',
  requestId: 'request-001',
  jurisdiction: 'CN_MAINLAND',
  locale: 'zh-CN',
  platform: 'DEFAULT',
  ruleVersion: '1.0.0',
  lawKbVersion: 'local-test',
  evaluatedAt: '2026-06-17T00:00:00.000Z',
} as const;

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'evidence-001',
    title: '岗位原文',
    sourceType: 'JOB_TEXT',
    url: 'job://description',
    version: 'input',
    quote: '限女性',
    metadata: {
      categories: ['DISCRIMINATION'],
    },
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  const linkedEvidence = evidence();
  return {
    id: 'finding-001',
    category: 'DISCRIMINATION',
    severity: 'HIGH',
    decision: 'MANUAL_REVIEW',
    title: 'CN_DISCRIMINATION_GENDER_001',
    message: '岗位存在疑似就业歧视风险。',
    evidence: [linkedEvidence],
    evidenceIds: [linkedEvidence.id],
    ruleId: 'CN_DISCRIMINATION_GENDER_001',
    evidenceId: linkedEvidence.id,
    metadata: {
      matchedText: ['限女性'],
    },
    ...overrides,
  };
}

function auditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    auditId: 'audit-reflection-001',
    decision: 'MANUAL_REVIEW',
    severity: 'HIGH',
    riskLevel: 'HIGH',
    summary: '发现 1 个风险项，建议人工复核。',
    findings: [finding()],
    evidence: [evidence()],
    suggestions: ['删除与履职无关的性别限制。'],
    compliantRewrite: null,
    context: baseContext,
    checkerResults: [],
    createdAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('Enhanced ReflectionChecker', () => {
  const checker = new ReflectionChecker();

  it('passes a consistent traceable high-risk result', () => {
    const result = checker.check(auditResult(), { sourceText: '招聘行政专员，限女性。' });

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('marks a high finding without ruleId or evidenceId', () => {
    const {
      ruleId: _ruleId,
      evidenceId: _evidenceId,
      ...untraceable
    } = finding({
      evidence: [],
      evidenceIds: [],
    });
    const result = checker.check(
      auditResult({
        findings: [untraceable],
        evidence: [],
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'HIGH_RISK_WITHOUT_TRACE', findingId: 'finding-001' }),
      ]),
    );
    expect(result.passed).toBe(false);
  });

  it('marks matchedText that is absent from the original source text', () => {
    const result = checker.check(auditResult(), { sourceText: '招聘行政专员。' });

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'MATCHED_TEXT_NOT_IN_SOURCE' })]),
    );
  });

  it('marks finding decision that is weaker than severity requires', () => {
    const result = checker.check(
      auditResult({
        findings: [
          finding({
            severity: 'CRITICAL',
            decision: 'MANUAL_REVIEW',
          }),
        ],
        decision: 'REJECT',
        riskLevel: 'CRITICAL',
        severity: 'CRITICAL',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'FINDING_DECISION_MISMATCH' })]),
    );
  });

  it('marks critical results that do not reject', () => {
    const result = checker.check(
      auditResult({
        findings: [
          finding({
            severity: 'CRITICAL',
            decision: 'REJECT',
          }),
        ],
        decision: 'MANUAL_REVIEW',
        riskLevel: 'CRITICAL',
        severity: 'CRITICAL',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CRITICAL_REQUIRES_REJECT' })]),
    );
  });

  it('marks high results that are weaker than manual review', () => {
    const result = checker.check(
      auditResult({
        decision: 'ALLOW_WITH_WARNING',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'HIGH_REQUIRES_MANUAL_REVIEW' })]),
    );
  });

  it('marks decision and risk level that do not match aggregated severity', () => {
    const result = checker.check(
      auditResult({
        decision: 'PASS',
        riskLevel: 'NONE',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DECISION_MISMATCH' }),
        expect.objectContaining({ code: 'RISK_LEVEL_MISMATCH' }),
      ]),
    );
  });

  it('marks RAG evidence whose category metadata does not match the finding category', () => {
    const wrongEvidence = evidence({
      id: 'evidence-wrong-category',
      sourceType: 'LAW',
      metadata: {
        categories: ['FEE_DEPOSIT'],
      },
    });
    const result = checker.check(
      auditResult({
        findings: [
          finding({
            evidence: [wrongEvidence],
            evidenceIds: [wrongEvidence.id],
            evidenceId: wrongEvidence.id,
          }),
        ],
        evidence: [wrongEvidence],
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RAG_EVIDENCE_CATEGORY_MISMATCH',
          evidenceId: 'evidence-wrong-category',
        }),
      ]),
    );
  });

  it('marks rewrittenPosting/compliantRewrite that still contains high-risk words', () => {
    const result = checker.check(
      auditResult({
        compliantRewrite: '招聘行政专员，限女性，负责日常行政工作。',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REWRITE_CONTAINS_HIGH_RISK_TEXT' }),
      ]),
    );
  });

  it('marks insufficient evidence and suggests manual-review correction', () => {
    const {
      ruleId: _ruleId,
      evidenceId: _evidenceId,
      ...untraceableCritical
    } = finding({
      severity: 'CRITICAL',
      decision: 'REJECT',
      evidence: [],
      evidenceIds: [],
    });
    const result = checker.check(
      auditResult({
        decision: 'REJECT',
        riskLevel: 'CRITICAL',
        severity: 'CRITICAL',
        findings: [untraceableCritical],
        evidence: [],
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INSUFFICIENT_EVIDENCE_REQUIRES_REVIEW' }),
      ]),
    );
    expect(result.correctedResult?.decision).toBe('MANUAL_REVIEW');
  });

  it('marks absolute legal conclusions in user-facing text', () => {
    const result = checker.check(
      auditResult({
        summary: '该企业已经违法，建议拦截。',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ABSOLUTE_LEGAL_CONCLUSION' })]),
    );
  });

  it('marks leaked internal rule weights or thresholds', () => {
    const result = checker.check(
      auditResult({
        summary: '规则权重=0.91，因此建议人工复核。',
      }),
      { sourceText: '招聘行政专员，限女性。' },
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INTERNAL_RULE_WEIGHT_LEAK' })]),
    );
  });
});
