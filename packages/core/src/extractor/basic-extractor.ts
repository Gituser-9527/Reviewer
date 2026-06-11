import type { JobFacts, SalaryFacts } from '@job-compliance/shared';
import type { ExtractionInput, JobFactsExtractor } from './types.js';

const sectionHeadings = [
  '岗位职责',
  '工作职责',
  '职位描述',
  '任职要求',
  '岗位要求',
  '职位要求',
  '任职资格',
  '福利待遇',
  '薪资福利',
  '公司福利',
] as const;

const responsibilityHeadings = new Set(['岗位职责', '工作职责', '职位描述']);
const requirementHeadings = new Set(['任职要求', '岗位要求', '职位要求', '任职资格']);
const benefitHeadings = new Set(['福利待遇', '薪资福利', '公司福利']);

const employmentTypes: ReadonlyArray<[string, string]> = [
  ['全职', 'FULL_TIME'],
  ['兼职', 'PART_TIME'],
  ['实习', 'INTERNSHIP'],
  ['劳务派遣', 'DISPATCH'],
  ['劳务', 'CONTRACT'],
  ['合同工', 'CONTRACT'],
  ['临时工', 'TEMPORARY'],
];

const sensitivePatterns = [
  /限女性|只招女性|女性优先|限男性|只招男性|男性优先/giu,
  /已婚已育优先|未婚优先|已婚优先|无生育计划|三年内不生育/giu,
  /(?:年龄|年纪).{0,6}(?:不超过|以下|以内|限)\s*\d{2}\s*(?:岁)?/giu,
  /\d{2}\s*[-至到]\s*\d{2}\s*岁/giu,
  /本地户口优先|限本地户籍|外地人勿扰|限本省人|本地人优先/giu,
  /无残疾|身体无缺陷|乙肝携带者勿扰|不得有传染病/giu,
] as const;

const feePatterns = [
  /保证金|押金|服装费|培训贷|入职费/giu,
  /(?:缴纳|支付|交纳|收取).{0,12}\d+(?:\.\d+)?\s*元/giu,
  /先交费后上岗|收费培训|岗前培训自费|培训费用自理|分期培训费/giu,
] as const;

const personalInfoPatterns = [
  /面试前提交身份证|发送身份证照片|提供身份证正反面|上传身份证复印件/giu,
  /提供银行卡密码|提供支付密码|提供网银密码|提供银行卡验证码/giu,
  /提供家庭成员身份证|提交配偶信息|填写父母工作单位|提供子女信息/giu,
  /(?:提交|提供|上传).{0,8}(?:基因|遗传|病史|体检报告|健康档案)/giu,
] as const;

const unclearClaimPatterns = [
  /保证月入|保底月入十万|收入无上限|轻松月入过万|百分百高薪/giu,
  /(?:日赚|每天赚|一天赚)\s*\d+(?:\.\d+)?\s*元/giu,
  /百分百录用|保证入职|绝不加班|永不裁员|无任何风险/giu,
  /零门槛.{0,8}(?:月入|日赚)/giu,
] as const;

const benefitKeywords = [
  '五险一金',
  '补充医疗',
  '带薪年假',
  '年终奖',
  '餐补',
  '交通补贴',
  '住房补贴',
  '节日福利',
  '弹性工作',
  '定期体检',
] as const;

function normalizeText(rawText: string): string {
  return rawText
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t\f\v]+/gu, ' ')
    .replace(/[ ]{2,}/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanListItem(value: string): string {
  return value
    .replace(/^\s*(?:[-*•·]|\d+[.、)])\s*/u, '')
    .replace(/[；;。]\s*$/u, '')
    .trim();
}

function sourceLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function headingForLine(line: string): string | null {
  const normalized = line.replace(/[：:]\s*$/u, '').trim();
  return sectionHeadings.find((heading) => normalized === heading) ?? null;
}

function extractSections(text: string): {
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
} {
  const result = {
    responsibilities: [] as string[],
    requirements: [] as string[],
    benefits: [] as string[],
  };
  let active: 'responsibilities' | 'requirements' | 'benefits' | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      active = null;
      continue;
    }
    const inlineHeading = sectionHeadings.find((heading) =>
      new RegExp(`^${heading}[：:]`, 'u').test(line),
    );
    const heading = headingForLine(line) ?? inlineHeading ?? null;
    if (heading !== null) {
      active = responsibilityHeadings.has(heading)
        ? 'responsibilities'
        : requirementHeadings.has(heading)
          ? 'requirements'
          : benefitHeadings.has(heading)
            ? 'benefits'
            : null;
      const inlineContent = cleanListItem(line.replace(new RegExp(`^${heading}[：:]?`, 'u'), ''));
      if (active !== null && inlineContent.length > 0) result[active].push(inlineContent);
      continue;
    }
    if (active !== null) {
      const item = cleanListItem(line);
      if (item.length > 0) result[active].push(item);
    }
  }

  return {
    responsibilities: unique(result.responsibilities),
    requirements: unique(result.requirements),
    benefits: unique(result.benefits),
  };
}

function extractLabeledValue(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[：:]\\s*([^\\n]+)`, 'iu'));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function inferTitle(text: string): string {
  const labeled = extractLabeledValue(text, ['岗位名称', '职位名称', '招聘岗位', '职位']);
  if (labeled) return labeled;
  const firstLine = sourceLines(text)[0];
  if (
    firstLine &&
    firstLine.length <= 40 &&
    !firstLine.includes('：') &&
    !firstLine.includes(':') &&
    headingForLine(firstLine) === null
  ) {
    return cleanListItem(firstLine);
  }
  return '';
}

function inferEmploymentType(text: string): string | undefined {
  const labeled = extractLabeledValue(text, ['用工形式', '工作性质', '职位类型']);
  const source = labeled ?? text;
  return employmentTypes.find(([keyword]) => source.includes(keyword))?.[1];
}

function salaryMultiplier(unit: string | undefined): number {
  if (!unit || unit === '元') return 1;
  if (unit.toLowerCase() === 'k' || unit === '千') return 1_000;
  if (unit === '万') return 10_000;
  return 1;
}

function salaryPeriod(text: string): string | undefined {
  if (/每月|月薪|\/月|月/iu.test(text)) return 'MONTH';
  if (/每年|年薪|\/年|年/iu.test(text)) return 'YEAR';
  if (/每天|日薪|\/天|天/iu.test(text)) return 'DAY';
  if (/每小时|时薪|\/时|小时/iu.test(text)) return 'HOUR';
  return undefined;
}

function extractSalary(text: string): SalaryFacts | undefined {
  const range = text.match(
    /(?:薪资|薪酬|工资|月薪|年薪)?\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(k|千|万)?\s*[-~至到]\s*(\d+(?:\.\d+)?)\s*(k|千|万|元)(?:\s*(?:\/|每)?\s*(月|年|天|小时))?/iu,
  );
  if (range) {
    const rawText = range[0].trim();
    const minUnit = range[2] ?? range[4];
    const period = salaryPeriod(rawText);
    return {
      rawText,
      min: Number(range[1]) * salaryMultiplier(minUnit),
      max: Number(range[3]) * salaryMultiplier(range[4]),
      currency: 'CNY',
      ...(period === undefined ? {} : { period }),
    };
  }

  const single = text.match(
    /(?:薪资|薪酬|工资|月薪|年薪)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(k|千|万|元)(?:\s*(?:\/|每)?\s*(月|年|天|小时))?/iu,
  );
  if (!single) return undefined;
  const rawText = single[0].trim();
  const amount = Number(single[1]) * salaryMultiplier(single[2]);
  const period = salaryPeriod(rawText);
  return {
    rawText,
    min: amount,
    max: amount,
    currency: 'CNY',
    ...(period === undefined ? {} : { period }),
  };
}

function collectPatternMatches(text: string, patterns: readonly RegExp[]): string[] {
  return unique(
    patterns.flatMap((pattern) => {
      pattern.lastIndex = 0;
      return [...text.matchAll(pattern)].map((match) => match[0]);
    }),
  );
}

function collectBenefits(text: string, sectionBenefits: string[]): string[] {
  const sentences = text.split(/[\n。；;！!]/u).map((part) => cleanListItem(part));
  const keywordSentences = sentences.filter((sentence) =>
    benefitKeywords.some((keyword) => sentence.includes(keyword)),
  );
  return unique([...sectionBenefits, ...keywordSentences]);
}

function missingFields(
  facts: Pick<JobFacts, 'jobTitle' | 'responsibilities' | 'location' | 'salary'>,
): string[] {
  const missing: string[] = [];
  if (!facts.jobTitle) missing.push('title');
  if (facts.responsibilities.length === 0) missing.push('responsibilities');
  if (!facts.location) missing.push('location');
  if (!facts.salary) missing.push('salary');
  return missing;
}

/** Extracts JobFacts using deterministic text parsing only. */
export function extractBasicJobFacts(input: ExtractionInput): JobFacts {
  const normalizedText = normalizeText(input.rawText);
  const structured = input.structuredInput;
  const sections = extractSections(normalizedText);
  const jobTitle = structured?.title?.trim() || inferTitle(normalizedText);
  const companyName =
    structured?.companyName?.trim() ||
    extractLabeledValue(normalizedText, ['公司名称', '招聘单位', '企业名称']);
  const location =
    structured?.location?.trim() ||
    extractLabeledValue(normalizedText, ['工作地点', '工作地址', '办公地点', '地点']);
  const responsibilities = unique([
    ...(structured?.responsibilities ?? []),
    ...sections.responsibilities,
  ]);
  const requirements = unique([...(structured?.requirements ?? []), ...sections.requirements]);
  const benefits = collectBenefits(normalizedText, sections.benefits);
  const salary = structured?.salary
    ? {
        ...(structured.salary.text === undefined ? {} : { rawText: structured.salary.text }),
        ...(structured.salary.min === undefined ? {} : { min: structured.salary.min }),
        ...(structured.salary.max === undefined ? {} : { max: structured.salary.max }),
        ...(structured.salary.currency === undefined
          ? {}
          : { currency: structured.salary.currency }),
        ...(structured.salary.period === undefined ? {} : { period: structured.salary.period }),
      }
    : extractSalary(normalizedText);
  const sensitiveConditions = collectPatternMatches(normalizedText, sensitivePatterns);
  const feesOrDeposit = collectPatternMatches(normalizedText, feePatterns);
  const personalInfoRequests = collectPatternMatches(normalizedText, personalInfoPatterns);
  const unclearClaims = collectPatternMatches(normalizedText, unclearClaimPatterns);
  const employmentType = structured?.employmentType || inferEmploymentType(normalizedText);

  const baseFacts = {
    jobTitle,
    ...(companyName ? { companyName } : {}),
    title: jobTitle,
    normalizedText,
    responsibilities,
    requirements,
    ...(location ? { location } : {}),
    locations: location ? [location] : [],
    ...(employmentType ? { employmentType } : {}),
    ...(salary && Object.keys(salary).length > 0 ? { salary } : {}),
    benefits,
    sensitiveConditions,
    feesOrDeposit,
    personalInfoRequests,
    unclearClaims,
    feeStatements: feesOrDeposit,
    personalDataRequests: personalInfoRequests,
    attributes: {},
  } satisfies Omit<JobFacts, 'missingFields'>;

  return {
    ...baseFacts,
    missingFields: missingFields(baseFacts),
  };
}

/** Singleton deterministic extractor used by the first implementation phase. */
export const basicExtractor: JobFactsExtractor = {
  async extract(input: ExtractionInput): Promise<JobFacts> {
    return extractBasicJobFacts(input);
  },
};
