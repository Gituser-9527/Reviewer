import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  AuditDecision,
  JobPostingInput,
  RiskCategory,
} from '../packages/shared/dist/index.js';
import { auditJobPosting } from '../packages/core/dist/index.js';

interface EvalCase {
  id: string;
  input: JobPostingInput;
  expected: {
    decision: AuditDecision;
    categories: RiskCategory[];
    minRiskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  };
}

interface FailedCase {
  id: string;
  reasons: string[];
  expected: EvalCase['expected'];
  actual: {
    decision: string;
    riskLevel: string;
    categories: string[];
    evidenceCount: number;
  };
}

const severityRank: Record<string, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const datasetPath = resolve(process.cwd(), 'evals', 'datasets', 'job-posting-cases.jsonl');
const rulesDirectory =
  process.env.RULES_DIRECTORY === undefined
    ? undefined
    : resolve(process.cwd(), process.env.RULES_DIRECTORY);
const ruleVersion = process.env.RULE_VERSION;

function parseCase(line: string, lineNumber: number): EvalCase {
  const parsed = JSON.parse(line) as Partial<EvalCase>;
  if (!parsed.id || !parsed.input || !parsed.expected) {
    throw new TypeError(`Invalid eval case at line ${lineNumber}`);
  }
  return parsed as EvalCase;
}

async function loadCases(): Promise<EvalCase[]> {
  const content = await readFile(datasetPath, 'utf8');
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseCase(line, index + 1));
}

function riskMeetsMinimum(actual: string, expected: EvalCase['expected']['minRiskLevel']): boolean {
  return severityRank[actual.toUpperCase()] >= severityRank[expected.toUpperCase()];
}

function uniqueCategories(categories: readonly string[]): string[] {
  return [...new Set(categories)].sort();
}

async function main(): Promise<void> {
  const cases = await loadCases();
  let decisionMatches = 0;
  let expectedCategoryTotal = 0;
  let matchedCategoryTotal = 0;
  const failedCases: FailedCase[] = [];

  for (const entry of cases) {
    const result = await auditJobPosting(entry.input, {
      tenantId: 'eval',
      now: () => new Date('2026-06-16T00:00:00.000Z'),
      ...(rulesDirectory === undefined ? {} : { rulesDirectory }),
      ...(ruleVersion === undefined ? {} : { ruleVersion }),
    });
    const actualCategories = uniqueCategories(result.findings.map((finding) => finding.category));
    const expectedCategories = uniqueCategories(entry.expected.categories);
    const reasons: string[] = [];

    if (result.decision === entry.expected.decision) {
      decisionMatches += 1;
    } else {
      reasons.push(`decision expected ${entry.expected.decision}, got ${result.decision}`);
    }

    for (const category of expectedCategories) {
      expectedCategoryTotal += 1;
      if (actualCategories.includes(category)) {
        matchedCategoryTotal += 1;
      } else {
        reasons.push(`missing category ${category}`);
      }
    }

    if (expectedCategories.length === 0 && actualCategories.length > 0) {
      reasons.push(`expected no categories, got ${actualCategories.join(', ')}`);
    }

    if (!riskMeetsMinimum(result.riskLevel, entry.expected.minRiskLevel)) {
      reasons.push(
        `riskLevel expected at least ${entry.expected.minRiskLevel}, got ${result.riskLevel}`,
      );
    }

    if (result.decision !== 'PASS') {
      const findingWithoutEvidence = result.findings.find(
        (finding) => finding.evidenceIds.length === 0,
      );
      if (findingWithoutEvidence) {
        reasons.push(`finding ${findingWithoutEvidence.id} has no evidenceIds`);
      }
      if (result.evidence.length === 0) {
        reasons.push('non-PASS result returned no evidence');
      }
    }

    if (reasons.length > 0) {
      failedCases.push({
        id: entry.id,
        reasons,
        expected: entry.expected,
        actual: {
          decision: result.decision,
          riskLevel: result.riskLevel,
          categories: actualCategories,
          evidenceCount: result.evidence.length,
        },
      });
    }
  }

  const total = cases.length;
  const failed = failedCases.length;
  const passed = total - failed;
  const summary = {
    total,
    passed,
    failed,
    accuracy: total === 0 ? 0 : passed / total,
    categoryRecall: expectedCategoryTotal === 0 ? 1 : matchedCategoryTotal / expectedCategoryTotal,
    decisionAccuracy: total === 0 ? 0 : decisionMatches / total,
    failedCases,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
