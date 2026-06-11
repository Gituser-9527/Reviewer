import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { YamlRuleEngine, emptyJobFacts } from './yaml-rule-engine.js';

const rulesDirectory = fileURLToPath(new URL('../../../../rules/cn-mainland/', import.meta.url));

const loadEngine = () => YamlRuleEngine.fromDirectory(rulesDirectory);

describe('YamlRuleEngine', () => {
  it('loads at least twenty mainland China rules', async () => {
    const engine = await loadEngine();

    expect(engine.ruleCount).toBeGreaterThanOrEqual(20);
  });

  it('matches discrimination and fee risks in the acceptance text', async () => {
    const engine = await loadEngine();
    const rawText = '限女性，已婚已育优先，入职需缴纳500元服装费';
    const hits = engine.evaluate({
      rawText,
      normalizedText: rawText,
      extractedFacts: emptyJobFacts(rawText),
      jurisdiction: 'CN_MAINLAND',
      ruleVersion: '1.0.0',
    });

    expect(new Set(hits.map((hit) => hit.category))).toEqual(
      new Set(['DISCRIMINATION', 'FEE_DEPOSIT']),
    );
    expect(hits.some((hit) => hit.ruleId === 'CN_DISCRIMINATION_GENDER_001')).toBe(true);
    expect(hits.some((hit) => hit.ruleId === 'CN_FEE_DEPOSIT_001')).toBe(true);
    expect(hits.flatMap((hit) => hit.matchedText)).toEqual(
      expect.arrayContaining(['限女性', '已婚已育优先', '服装费']),
    );
  });

  it('supports regex matching and returns evidence offsets', async () => {
    const engine = await loadEngine();
    const rawText = '应聘者年龄不超过30岁。';
    const hits = engine.evaluate({
      rawText,
      normalizedText: rawText,
      extractedFacts: emptyJobFacts(rawText),
      jurisdiction: 'CN',
      ruleVersion: '1.0.0',
    });
    const hit = hits.find((entry) => entry.ruleId === 'CN_DISCRIMINATION_AGE_003');

    expect(hit?.matchedText).toContain('年龄不超过30岁');
    expect(hit?.evidence[0]).toMatchObject({
      fieldPath: 'rawText',
      quote: '年龄不超过30岁',
      start: 3,
      end: 11,
    });
  });

  it('matches structured missing-field facts', async () => {
    const engine = await loadEngine();
    const facts = emptyJobFacts('招聘岗位');
    facts.missingFields = ['location', 'salary'];
    const hits = engine.evaluate({
      rawText: '招聘岗位',
      normalizedText: '招聘岗位',
      extractedFacts: facts,
      jurisdiction: 'CN_MAINLAND',
      ruleVersion: '1.0.0',
    });

    expect(hits.map((hit) => hit.ruleId)).toEqual(
      expect.arrayContaining(['CN_COMPLETENESS_LOCATION_003', 'CN_COMPLETENESS_SALARY_004']),
    );
  });

  it('does not apply rules from a different version or jurisdiction', async () => {
    const engine = await loadEngine();
    const rawText = '入职需缴纳500元押金';
    const facts = emptyJobFacts(rawText);

    expect(
      engine.evaluate({
        rawText,
        normalizedText: rawText,
        extractedFacts: facts,
        jurisdiction: 'US',
        ruleVersion: '1.0.0',
      }),
    ).toEqual([]);
    expect(
      engine.evaluate({
        rawText,
        normalizedText: rawText,
        extractedFacts: facts,
        jurisdiction: 'CN_MAINLAND',
        ruleVersion: '2.0.0',
      }),
    ).toEqual([]);
  });
});
