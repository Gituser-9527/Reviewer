import { describe, expect, it } from 'vitest';
import type { AuditResult, Finding, JobPostingInput } from '@job-compliance/shared';
import type { RuleEngine } from '../ports/rule-engine.js';
import { auditJobPosting } from './audit-orchestrator.js';
import { MockEvidenceRetriever } from '../rag/mock-evidence-retriever.js';
import { AuditReflectionError, ReflectionChecker } from './reflection-checker.js';
import { RiskAggregator } from './risk-aggregator.js';

function finding(severity: Finding['severity']): Finding {
  return {
    id: `finding-${severity}`,
    category: 'OTHER',
    severity,
    decision: 'MANUAL_REVIEW',
    title: `${severity} finding`,
    message: 'Test finding.',
    evidence: [],
    evidenceIds: [],
    ruleId: `RULE-${severity}`,
  };
}

function completeInput(description: string): JobPostingInput {
  return {
    title: '行政专员',
    description,
    responsibilities: ['负责行政事务与文件管理'],
    requirements: ['具备良好沟通能力'],
    location: '上海',
    employmentType: 'FULL_TIME',
    salary: {
      text: '8000-10000元/月',
      min: 8000,
      max: 10000,
      currency: 'CNY',
      period: 'MONTH',
    },
  };
}

describe('RiskAggregator', () => {
  const aggregator = new RiskAggregator();

  it.each([
    [[], 'PASS', 'NONE'],
    [[finding('LOW')], 'ALLOW_WITH_WARNING', 'LOW'],
    [[finding('MEDIUM')], 'ALLOW_WITH_WARNING', 'MEDIUM'],
    [[finding('HIGH')], 'MANUAL_REVIEW', 'HIGH'],
    [[finding('HIGH'), finding('CRITICAL')], 'REJECT', 'CRITICAL'],
  ] as const)('aggregates findings by highest severity', (findings, decision, riskLevel) => {
    expect(aggregator.aggregate(findings)).toEqual({ decision, riskLevel });
  });
});

describe('ReflectionChecker', () => {
  it('rejects a high-risk finding without ruleId or evidenceId', () => {
    const checker = new ReflectionChecker();
    const { ruleId: _ruleId, ...untraceable } = finding('HIGH');
    const result = {
      auditId: 'audit-1',
      decision: 'MANUAL_REVIEW',
      severity: 'HIGH',
      riskLevel: 'HIGH',
      summary: 'Test result.',
      findings: [untraceable],
      evidence: [],
      suggestions: [],
      compliantRewrite: null,
      context: {
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        requestId: 'request-1',
        jurisdiction: 'CN_MAINLAND',
        locale: 'zh-CN',
        platform: 'DEFAULT',
        ruleVersion: '1.0.0',
        lawKbVersion: 'mock-1.0.0',
        evaluatedAt: '2026-06-11T00:00:00.000Z',
      },
      checkerResults: [],
      createdAt: '2026-06-11T00:00:00.000Z',
    } satisfies AuditResult;

    expect(() => checker.assertValid(result)).toThrow(AuditReflectionError);
    expect(checker.check(result).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'HIGH_RISK_WITHOUT_TRACE' })]),
    );
  });
});

describe('auditJobPosting', () => {
  it('rejects the acceptance sample with critical fee and discrimination findings', async () => {
    const result = await auditJobPosting({
      title: '行政专员',
      description: '招聘行政专员，限女性，已婚已育优先。入职需缴纳500元服装费。',
    });

    expect(result.decision).toBe('REJECT');
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.findings.map((entry) => entry.category)).toEqual(
      expect.arrayContaining(['DISCRIMINATION', 'FEE_DEPOSIT']),
    );
    expect(result.findings.every((entry) => entry.severity !== 'HIGH' || entry.ruleId)).toBe(true);
    expect(result.findings.every((entry) => entry.severity !== 'CRITICAL' || entry.ruleId)).toBe(
      true,
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'CN_LAW_EMPLOYMENT_PROMOTION_FAIR_EMPLOYMENT',
          sourceType: 'LAW',
        }),
        expect.objectContaining({
          id: 'CN_LAW_LABOR_CONTRACT_FEE_DEPOSIT',
          sourceType: 'LAW',
        }),
      ]),
    );
    expect(
      result.findings.every((entry) => entry.evidenceIds.length === entry.evidence.length),
    ).toBe(true);
  });

  it('returns PASS and NONE when the complete posting has no rule hit', async () => {
    const result = await auditJobPosting(
      completeInput('负责日常行政支持，工作内容和薪酬信息真实明确。'),
    );

    expect(result.decision).toBe('PASS');
    expect(result.riskLevel).toBe('NONE');
    expect(result.findings).toEqual([]);
  });

  it('uses a mock retriever and attaches retrieved evidence', async () => {
    const retriever = new MockEvidenceRetriever((query) => [
      {
        id: `mock:${query.category}`,
        title: 'Mock policy',
        sourceType: 'PLATFORM_POLICY',
        url: 'urn:test:mock-policy',
        version: '1.0.0',
        sourceName: 'Mock policy',
        sourceVersion: '1.0.0',
        quote: 'Mock evidence used only by this test.',
      },
    ]);

    const result = await auditJobPosting(completeInput('招聘限女性。'), {
      evidenceRetriever: retriever,
      now: () => new Date('2026-06-11T00:00:00.000Z'),
      generateId: (() => {
        let index = 0;
        return () => `id-${++index}`;
      })(),
    });

    expect(result.decision).toBe('MANUAL_REVIEW');
    expect(result.riskLevel).toBe('HIGH');
    expect(retriever.queries.length).toBeGreaterThan(0);
    expect(result.findings[0]?.evidenceId).toMatch(/^mock:/u);
    expect(result.findings[0]?.evidenceIds).toContain('mock:DISCRIMINATION');
    expect(result.evidence.some((entry) => entry.sourceName === 'Mock policy')).toBe(true);
  });

  it('runs reflection before returning a custom untraceable high-risk hit', async () => {
    const ruleEngine: RuleEngine = {
      evaluate: () => [
        {
          ruleId: '',
          ruleVersion: '1.0.0',
          category: 'OTHER',
          severity: 'HIGH',
          decision: 'MANUAL_REVIEW',
          action: 'manual_review',
          message: 'Untraceable custom hit.',
          evidence: [],
          matchedText: ['text'],
          matchedConditionIds: ['condition'],
        },
      ],
    };

    await expect(auditJobPosting(completeInput('普通岗位文本。'), { ruleEngine })).rejects.toThrow(
      AuditReflectionError,
    );
  });
});
