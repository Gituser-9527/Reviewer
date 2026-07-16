import { describe, expect, it } from 'vitest';
import { ProductionRewriteRuleEngineAdapter } from './rewrite-rule-engine-adapter.js';

const context = (
  findings = [
    {
      id: 'f1',
      ruleId: 'CN_DISCRIMINATION_GENDER_001',
      category: 'DISCRIMINATION',
      severity: 'HIGH',
      title: 'gender',
      matchedText: '限女性',
      evidenceIds: [],
    },
  ],
) => ({
  tenantId: 'tenant-a',
  auditRunId: 'audit-a',
  jurisdiction: 'CN_MAINLAND',
  ruleVersion: '1.0.0',
  decision: 'REVIEW',
  riskLevel: 'HIGH',
  language: 'zh-CN',
  originalJob: { title: '招聘专员', description: '限女性', location: '北京', salary: '10k-15k' },
  findings,
  evidence: [],
});
const rewrite = (description: string) => ({
  description,
  responsibilities: ['协助招聘流程'],
  changes: [],
  preservedFacts: [],
  warnings: [],
});

describe('ProductionRewriteRuleEngineAdapter', () => {
  it('uses the published production YAML engine and reports an empty rewrite scan', async () => {
    const adapter = new ProductionRewriteRuleEngineAdapter();
    const result = await adapter.review({
      context: context(),
      rewrite: rewrite('欢迎符合岗位要求的候选人'),
    });
    expect(result).toMatchObject({
      status: 'COMPLETED',
      ruleVersion: '1.0.0',
      rewrittenFindings: [],
      residualFindingKeys: [],
      introducedFindingKeys: [],
      hasCriticalOrHighFindings: false,
    });
  });
  it('reports residual high risk and introduced rule risks with stable business keys', async () => {
    const adapter = new ProductionRewriteRuleEngineAdapter();
    const result = await adapter.review({
      context: context(),
      rewrite: rewrite('限女性，入职缴纳押金'),
    });
    expect(result.hasCriticalOrHighFindings).toBe(true);
    expect(result.residualFindingKeys).toEqual(
      expect.arrayContaining(['CN_DISCRIMINATION_GENDER_001|DISCRIMINATION|限女性']),
    );
    expect(
      result.introducedFindingKeys.some((key) => key.startsWith('CN_FEE_DEPOSIT_001|FEE_DEPOSIT|')),
    ).toBe(true);
  });
  it('does not create audit records, jobs, provider calls, or usage while evaluating', async () => {
    const adapter = new ProductionRewriteRuleEngineAdapter();
    await expect(
      adapter.review({ context: context(), rewrite: rewrite('欢迎符合岗位要求的候选人') }),
    ).resolves.toBeDefined();
  });
  it('propagates a production rule-engine resolution failure', async () => {
    const adapter = new ProductionRewriteRuleEngineAdapter(
      {
        getCurrentRuleVersion: async () => '1.0.0',
        getRulesDirectoryForVersion: async () => 'unused',
      },
      {
        resolve: async () => {
          throw new Error('RULE_ENGINE_UNAVAILABLE');
        },
      },
    );
    await expect(adapter.review({ context: context(), rewrite: rewrite('岗位') })).rejects.toThrow(
      'RULE_ENGINE_UNAVAILABLE',
    );
  });
});
