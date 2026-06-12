import { describe, expect, expectTypeOf, it } from 'vitest';
import { ruleDefinitionSchema, ruleHitSchema, type RuleDefinition, type RuleHit } from './types.js';

const rule = {
  ruleId: 'CN-PLATFORM-001',
  ruleVersion: '1.0.0',
  name: 'Example structural rule',
  category: 'PLATFORM_POLICY',
  severity: 'MEDIUM',
  decision: 'MANUAL_REVIEW',
  priority: 500,
  enabled: true,
  conditions: [
    {
      id: 'condition-1',
      type: 'KEYWORD',
      fields: ['description'],
      values: ['example'],
    },
  ],
  evidenceRequired: true,
  message: 'The rule fixture validates the declarative contract.',
  suggestion: 'Review the matched phrase.',
  authorities: [{ authorityId: 'platform-policy', version: '1.0.0' }],
  effectiveFrom: '2026-06-11',
} satisfies RuleDefinition;

const hit = {
  ruleId: rule.ruleId,
  ruleVersion: rule.ruleVersion,
  category: rule.category,
  severity: rule.severity,
  decision: rule.decision,
  action: 'manual_review',
  message: rule.message,
  evidence: [
    {
      id: 'evidence-001',
      title: '岗位原文',
      sourceType: 'JOB_TEXT',
      url: 'urn:test:job-description',
      version: 'submitted',
      fieldPath: 'description',
      quote: 'example',
    },
  ],
  matchedText: ['example'],
  matchedConditionIds: ['condition-1'],
  suggestion: rule.suggestion,
} satisfies RuleHit;

describe('core rule contracts', () => {
  it('parses declarative rule definitions', () => {
    expect(ruleDefinitionSchema.parse(rule)).toEqual(rule);
    expectTypeOf(rule).toMatchTypeOf<RuleDefinition>();
  });

  it('parses traceable rule hits', () => {
    expect(ruleHitSchema.parse(hit)).toEqual(hit);
    expectTypeOf(hit).toMatchTypeOf<RuleHit>();
  });

  it('rejects invalid rule structure', () => {
    expect(ruleDefinitionSchema.safeParse({ ...rule, priority: 1001 }).success).toBe(false);
    expect(ruleHitSchema.safeParse({ ...hit, evidence: 'missing' }).success).toBe(false);
  });
});
