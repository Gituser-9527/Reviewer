import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  auditDecisionSchema,
  auditResultSchema,
  jobFactsSchema,
  jobPostingInputSchema,
  type AuditResult,
  type CheckerResult,
  type Evidence,
  type Finding,
  type JobFacts,
  type JobPostingInput,
} from './audit.js';

const job = {
  externalId: 'job-001',
  title: 'Backend Engineer',
  description: 'Build and maintain TypeScript services.',
  responsibilities: ['Build APIs'],
  requirements: ['TypeScript experience'],
  location: 'Shanghai',
  employmentType: 'FULL_TIME',
} satisfies JobPostingInput;

const facts = {
  jobTitle: 'Backend Engineer',
  title: 'Backend Engineer',
  normalizedText: 'Backend Engineer Build and maintain TypeScript services.',
  responsibilities: ['Build APIs'],
  requirements: ['TypeScript experience'],
  locations: ['Shanghai'],
  location: 'Shanghai',
  employmentType: 'FULL_TIME',
  benefits: [],
  sensitiveConditions: [],
  feesOrDeposit: [],
  personalInfoRequests: [],
  unclearClaims: [],
  feeStatements: [],
  personalDataRequests: [],
  missingFields: [],
  attributes: {},
} satisfies JobFacts;

const evidence = {
  id: 'evidence-001',
  title: 'Job description excerpt',
  sourceType: 'JOB_TEXT',
  url: 'urn:test:job-description',
  version: 'submitted',
  fieldPath: 'description',
  quote: 'Build and maintain TypeScript services.',
  start: 0,
  end: 39,
} satisfies Evidence;

const finding = {
  id: 'finding-001',
  category: 'OTHER',
  severity: 'LOW',
  decision: 'ALLOW_WITH_WARNING',
  title: 'Example structural finding',
  message: 'This fixture validates the public finding contract.',
  evidence: [evidence],
  evidenceIds: [evidence.id],
  checkerId: 'fixture-checker',
  confidence: 0.9,
} satisfies Finding;

const checkerResult = {
  checkerId: 'fixture-checker',
  checkerVersion: '1.0.0',
  status: 'COMPLETED',
  decision: 'ALLOW_WITH_WARNING',
  severity: 'LOW',
  findings: [finding],
  evidence: [evidence],
  durationMs: 4,
} satisfies CheckerResult;

const auditResult = {
  auditId: 'audit-001',
  decision: 'ALLOW_WITH_WARNING',
  severity: 'LOW',
  riskLevel: 'LOW',
  summary: 'The fixture contains one low-severity finding.',
  findings: [finding],
  evidence: [evidence],
  suggestions: ['Review the highlighted text.'],
  compliantRewrite: null,
  context: {
    auditId: 'audit-001',
    tenantId: 'tenant-001',
    requestId: 'request-001',
    jurisdiction: 'CN',
    locale: 'zh-CN',
    platform: 'DEFAULT',
    ruleVersion: 'rules-1.0.0',
    lawKbVersion: 'kb-1.0.0',
    evaluatedAt: '2026-06-11T00:00:00.000Z',
  },
  checkerResults: [checkerResult],
  createdAt: '2026-06-11T00:00:00.000Z',
} satisfies AuditResult;

describe('shared audit contracts', () => {
  it('parses valid job inputs and normalized facts', () => {
    expect(jobPostingInputSchema.parse(job)).toEqual(job);
    expect(jobFactsSchema.parse(facts)).toEqual(facts);
    expectTypeOf(job).toMatchTypeOf<JobPostingInput>();
    expectTypeOf(facts).toMatchTypeOf<JobFacts>();
  });

  it('parses a complete audit result', () => {
    expect(auditResultSchema.parse(auditResult)).toEqual(auditResult);
    expectTypeOf(auditResult).toMatchTypeOf<AuditResult>();
  });

  it('rejects invalid enum values and malformed input', () => {
    expect(auditDecisionSchema.safeParse('BLOCK').success).toBe(false);
    expect(jobPostingInputSchema.safeParse({ title: '', description: 42 }).success).toBe(false);
    expect(auditResultSchema.safeParse({ ...auditResult, decision: 'UNKNOWN' }).success).toBe(
      false,
    );
  });
});
