import { describe, expect, it } from 'vitest';
import { jobFactsSchema, type JobFacts } from '@job-compliance/shared';
import { basicExtractor, extractBasicJobFacts } from './basic-extractor.js';
import { MockLLMExtractor } from './mock-llm-extractor.js';
import type { LLMExtractor } from './types.js';

const rawJob = `
岗位名称：高级后端工程师
公司名称：示例科技有限公司
工作性质：全职
工作地点：上海市浦东新区
薪资：15k-25k/月

岗位职责：
1. 负责 Node.js 服务设计与开发
2. 维护 PostgreSQL 数据服务

任职要求：
- 3 年以上 TypeScript 开发经验
- 年龄不超过 35 岁，限女性

福利待遇：
- 五险一金
- 带薪年假和餐补

入职需缴纳 500 元服装费。
面试前提交身份证正反面。
保证月入，绝不加班。
`;

describe('basicExtractor', () => {
  it('extracts structured job facts from common Chinese job text', () => {
    const facts = extractBasicJobFacts({ rawText: rawJob });

    expect(facts).toMatchObject({
      jobTitle: '高级后端工程师',
      title: '高级后端工程师',
      companyName: '示例科技有限公司',
      employmentType: 'FULL_TIME',
      location: '上海市浦东新区',
      locations: ['上海市浦东新区'],
      salary: {
        min: 15000,
        max: 25000,
        currency: 'CNY',
        period: 'MONTH',
      },
    });
    expect(facts.responsibilities).toEqual([
      '负责 Node.js 服务设计与开发',
      '维护 PostgreSQL 数据服务',
    ]);
    expect(facts.requirements).toEqual(['3 年以上 TypeScript 开发经验', '年龄不超过 35 岁,限女性']);
    expect(facts.benefits).toEqual(expect.arrayContaining(['五险一金', '带薪年假和餐补']));
    expect(facts.sensitiveConditions).toEqual(
      expect.arrayContaining(['年龄不超过 35 岁', '限女性']),
    );
    expect(facts.feesOrDeposit).toEqual(expect.arrayContaining(['服装费', '缴纳 500 元']));
    expect(facts.personalInfoRequests).toContain('面试前提交身份证');
    expect(facts.unclearClaims).toEqual(expect.arrayContaining(['保证月入', '绝不加班']));
    expect(facts.missingFields).toEqual([]);
    expect(jobFactsSchema.safeParse(facts).success).toBe(true);
  });

  it('prefers caller-provided structured fields and reports missing facts', async () => {
    const facts = await basicExtractor.extract({
      rawText: '模糊招聘信息',
      structuredInput: {
        title: '数据分析师',
        companyName: '结构化公司',
        requirements: ['熟悉 SQL'],
        employmentType: 'CONTRACT',
      },
    });

    expect(facts.jobTitle).toBe('数据分析师');
    expect(facts.companyName).toBe('结构化公司');
    expect(facts.requirements).toEqual(['熟悉 SQL']);
    expect(facts.employmentType).toBe('CONTRACT');
    expect(facts.missingFields).toEqual(
      expect.arrayContaining(['responsibilities', 'location', 'salary']),
    );
  });
});

describe('MockLLMExtractor', () => {
  const mockFacts: JobFacts = {
    jobTitle: '测试岗位',
    title: '测试岗位',
    normalizedText: '测试岗位',
    responsibilities: [],
    requirements: [],
    locations: [],
    benefits: [],
    sensitiveConditions: [],
    feesOrDeposit: [],
    personalInfoRequests: [],
    unclearClaims: [],
    feeStatements: [],
    personalDataRequests: [],
    missingFields: ['responsibilities', 'location', 'salary'],
    attributes: {},
  };

  it('implements the future LLMExtractor contract without external calls', async () => {
    const extractor: LLMExtractor = new MockLLMExtractor(mockFacts);

    await expect(extractor.extract({ rawText: '任意输入' })).resolves.toEqual(mockFacts);
  });

  it('supports a test handler and validates its result', async () => {
    const extractor = new MockLLMExtractor((input, options) => ({
      ...mockFacts,
      jobTitle: `${input.rawText}-${options?.locale ?? 'unknown'}`,
      title: `${input.rawText}-${options?.locale ?? 'unknown'}`,
    }));

    const result = await extractor.extract({ rawText: '岗位' }, { locale: 'zh-CN' });
    expect(result.jobTitle).toBe('岗位-zh-CN');
  });
});
