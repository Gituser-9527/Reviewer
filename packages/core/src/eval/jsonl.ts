import type { AuditDecision, JobPostingInput, RiskCategory } from '@job-compliance/shared';
import { redactSensitiveInfo } from '../security/index.js';
import { normalizeEvalCase } from './evaluator.js';
import type { EvalCaseInput } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function redactOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? redactSensitiveInfo(value) : undefined;
}

function jobInputFromRecord(
  input: Record<string, unknown>,
  title: string,
  description: string,
): JobPostingInput {
  const location = redactOptionalString(input.location);
  const employmentType = redactOptionalString(input.employmentType);
  const companyName = redactOptionalString(input.companyName);
  const salary = isRecord(input.salary) ? input.salary : undefined;
  const salaryText = salary === undefined ? undefined : redactOptionalString(salary.text);
  const salaryMin = salary === undefined ? undefined : numberValue(salary.min);
  const salaryMax = salary === undefined ? undefined : numberValue(salary.max);
  const salaryCurrency = salary === undefined ? undefined : redactOptionalString(salary.currency);
  const salaryPeriod = salary === undefined ? undefined : redactOptionalString(salary.period);

  return {
    title,
    description,
    ...(location === undefined ? {} : { location }),
    ...(employmentType === undefined ? {} : { employmentType }),
    ...(companyName === undefined ? {} : { companyName }),
    ...(salary === undefined
      ? {}
      : {
          salary: {
            ...(salaryText === undefined ? {} : { text: salaryText }),
            ...(salaryMin === undefined ? {} : { min: salaryMin }),
            ...(salaryMax === undefined ? {} : { max: salaryMax }),
            ...(salaryCurrency === undefined ? {} : { currency: salaryCurrency }),
            ...(salaryPeriod === undefined ? {} : { period: salaryPeriod }),
          },
        }),
  };
}

export function parseEvalJsonl(content: string, datasetId?: string): EvalCaseInput[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = JSON.parse(line) as unknown;
      if (!isRecord(parsed)) throw new TypeError(`Invalid eval case at line ${index + 1}`);
      const input = isRecord(parsed.input) ? parsed.input : parsed;
      const expected = isRecord(parsed.expected) ? parsed.expected : parsed;
      const id = stringValue(parsed.id, `case_${String(index + 1).padStart(4, '0')}`);
      const description = redactSensitiveInfo(stringValue(input.description));
      const expectedSeverity = optionalStringValue(expected.minRiskLevel ?? expected.severity);
      const title = redactSensitiveInfo(stringValue(input.title, '未命名岗位'));
      if (description.length === 0) {
        throw new TypeError(`Eval case ${id} must include description`);
      }
      return normalizeEvalCase({
        id,
        ...(datasetId === undefined ? {} : { datasetId }),
        source: stringValue(parsed.source, 'jsonl'),
        jobInput: jobInputFromRecord(input, title, description),
        title,
        description,
        expectedDecision: stringValue(expected.decision, 'PASS') as AuditDecision,
        expectedCategories: stringArray(expected.categories) as RiskCategory[],
        ...(expectedSeverity === undefined ? {} : { expectedSeverity }),
        humanReason: redactSensitiveInfo(stringValue(parsed.humanReason ?? parsed.human_reason)),
        metadata: isRecord(parsed.metadata) ? parsed.metadata : {},
      });
    });
}
