import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  AuditDecision,
  JobPostingInput,
  RiskCategory,
} from '../packages/shared/dist/index.js';
import {
  auditJobPosting,
  normalizeEvalCase,
  type EvalCaseInput,
} from '../packages/core/dist/index.js';

interface RedTeamCase {
  id: string;
  attackType: string;
  input: Pick<JobPostingInput, 'title' | 'description'> & Partial<JobPostingInput>;
  expected: {
    decision: AuditDecision;
    categories: RiskCategory[];
    reason: string;
    minRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

interface FailedCase {
  id: string;
  attackType: string;
  reasons: string[];
  input: RedTeamCase['input'];
  expected: RedTeamCase['expected'];
  actual: {
    auditId: string;
    decision: AuditDecision;
    riskLevel: string;
    categories: string[];
    ruleIds: string[];
    evidenceCount: number;
  };
}

interface CliArgs {
  file: string;
  outputDir: string;
  datasetId: string;
  appendToEvalFile?: string;
  persistFailures: boolean;
  strict: boolean;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion: string;
}

const severityRank: Record<string, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function parseArgs(argv: readonly string[]): CliArgs {
  const args = new Map<string, string | true>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value] = item.slice(2).split('=', 2);
    args.set(key, value ?? true);
  }
  return {
    file: String(
      args.get('file') ??
        process.env.RED_TEAM_DATASET_PATH ??
        resolve(process.cwd(), 'evals', 'red-team', 'adversarial-cases.jsonl'),
    ),
    outputDir: String(
      args.get('outputDir') ??
        process.env.RED_TEAM_OUTPUT_DIR ??
        resolve(process.cwd(), 'evals', 'red-team', 'output'),
    ),
    datasetId: String(args.get('datasetId') ?? process.env.RED_TEAM_DATASET_ID ?? 'red_team_failed'),
    appendToEvalFile:
      typeof args.get('appendToEvalFile') === 'string'
        ? String(args.get('appendToEvalFile'))
        : process.env.RED_TEAM_APPEND_TO_EVAL_FILE,
    persistFailures: args.has('persistFailures') || process.env.RED_TEAM_PERSIST_FAILURES === 'true',
    strict: args.has('strict') || process.env.RED_TEAM_STRICT === 'true',
    ruleVersion:
      typeof args.get('ruleVersion') === 'string'
        ? String(args.get('ruleVersion'))
        : process.env.RULE_VERSION,
    lawKbVersion:
      typeof args.get('lawKbVersion') === 'string'
        ? String(args.get('lawKbVersion'))
        : process.env.LAW_KB_VERSION,
    modelVersion:
      typeof args.get('modelVersion') === 'string'
        ? String(args.get('modelVersion'))
        : (process.env.MODEL_VERSION ?? 'mock'),
  };
}

function parseCase(line: string, lineNumber: number): RedTeamCase {
  const parsed = JSON.parse(line) as Partial<RedTeamCase>;
  if (
    parsed.id === undefined ||
    parsed.attackType === undefined ||
    parsed.input === undefined ||
    parsed.expected === undefined ||
    parsed.input.title === undefined ||
    parsed.input.description === undefined ||
    parsed.expected.decision === undefined ||
    parsed.expected.categories === undefined ||
    parsed.expected.reason === undefined
  ) {
    throw new TypeError(`Invalid red-team case at line ${lineNumber}`);
  }
  return parsed as RedTeamCase;
}

async function loadCases(file: string): Promise<RedTeamCase[]> {
  const content = await readFile(resolve(process.cwd(), file), 'utf8');
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseCase(line, index + 1));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function riskMeetsMinimum(actual: string, expected?: string): boolean {
  if (expected === undefined) return true;
  return (severityRank[actual.toUpperCase()] ?? 0) >= (severityRank[expected.toUpperCase()] ?? 0);
}

function isDetected(actualCategories: readonly string[], resultDecision: AuditDecision, expected: RedTeamCase['expected']): boolean {
  return (
    resultDecision !== 'PASS' &&
    expected.categories.some((category) => actualCategories.includes(category))
  );
}

function toEvalCase(entry: RedTeamCase, datasetId: string): EvalCaseInput {
  return normalizeEvalCase({
    id: `redteam_failed_${entry.id}`,
    datasetId,
    source: 'red_team',
    title: entry.input.title,
    description: entry.input.description,
    jobInput: entry.input as JobPostingInput,
    expectedDecision: entry.expected.decision,
    expectedCategories: entry.expected.categories,
    ...(entry.expected.minRiskLevel === undefined ? {} : { expectedSeverity: entry.expected.minRiskLevel }),
    humanReason: entry.expected.reason,
    metadata: {
      redTeamCaseId: entry.id,
      attackType: entry.attackType,
      labelSchemaVersion: 'red-team-v1',
    },
  });
}

function toSuggestion(failure: FailedCase): Record<string, unknown> {
  return {
    id: `redteam_rule_suggestion_${failure.id}`,
    source: 'red_team',
    status: 'open',
    attackType: failure.attackType,
    category: failure.expected.categories[0] ?? 'OTHER',
    title: `Red-team bypass: ${failure.attackType}`,
    description: [
      `样本 ${failure.id} 可能绕过当前规则。`,
      `期望：${failure.expected.decision} / ${failure.expected.categories.join(', ')}`,
      `实际：${failure.actual.decision} / ${failure.actual.categories.join(', ') || 'none'}`,
      `原因：${failure.reasons.join('; ')}`,
      `标注说明：${failure.expected.reason}`,
    ].join('\n'),
    suggestedRuleKeywords: extractKeywords(failure.input.description),
    createdAt: new Date().toISOString(),
  };
}

function extractKeywords(description: string): string[] {
  const tokens = description.match(/[\p{Script=Han}A-Za-z0-9]{2,}/gu) ?? [];
  return [...new Set(tokens)].slice(0, 12);
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(file: string, values: readonly unknown[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${values.map((value) => JSON.stringify(value)).join('\n')}\n`, 'utf8');
}

async function appendJsonl(file: string, values: readonly unknown[]): Promise<void> {
  if (values.length === 0) return;
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${values.map((value) => JSON.stringify(value)).join('\n')}\n`, 'utf8');
}

async function persistFailedEvalCases(cases: readonly EvalCaseInput[], datasetId: string): Promise<void> {
  if (cases.length === 0) return;
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
    console.warn('DATABASE_URL is not configured; skipping red-team failure persistence.');
    return;
  }
  const { PostgresEvalRepository } = await import('../packages/database/dist/index.js');
  const repository = new PostgresEvalRepository({ connectionString: process.env.DATABASE_URL });
  try {
    await repository.createDataset({
      id: datasetId,
      name: 'Red Team Failed Cases',
      version: 'red-team-v1',
      description: 'Adversarial samples missed by the audit system.',
    });
    await repository.addCases(datasetId, cases);
  } finally {
    await repository.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadCases(args.file);
  let detectedTotal = 0;
  let decisionMatches = 0;
  let expectedCategoryTotal = 0;
  let matchedCategoryTotal = 0;
  const failedCases: FailedCase[] = [];
  const bypassFailureCases: FailedCase[] = [];
  const byAttackType = new Map<string, { total: number; detected: number; failed: number }>();

  for (const entry of cases) {
    const result = await auditJobPosting(entry.input as JobPostingInput, {
      tenantId: 'red_team',
      now: () => new Date('2026-06-25T00:00:00.000Z'),
      ...(args.ruleVersion === undefined ? {} : { ruleVersion: args.ruleVersion }),
      ...(args.lawKbVersion === undefined ? {} : { lawKbVersion: args.lawKbVersion }),
      modelVersion: args.modelVersion,
    });
    const actualCategories = uniqueSorted(result.findings.map((finding) => finding.category));
    const expectedCategories = uniqueSorted(entry.expected.categories);
    const detected = isDetected(actualCategories, result.decision, entry.expected);
    const reasons: string[] = [];
    const attackStats = byAttackType.get(entry.attackType) ?? { total: 0, detected: 0, failed: 0 };
    attackStats.total += 1;
    if (detected) {
      detectedTotal += 1;
      attackStats.detected += 1;
    } else {
      reasons.push('bypass: result did not produce a non-PASS expected risk category');
    }

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

    if (!riskMeetsMinimum(result.riskLevel, entry.expected.minRiskLevel)) {
      reasons.push(
        `riskLevel expected at least ${entry.expected.minRiskLevel}, got ${result.riskLevel}`,
      );
    }

    if (result.decision !== 'PASS' && result.evidence.length === 0) {
      reasons.push('non-PASS result returned no evidence');
    }

    if (reasons.length > 0) {
      const failure: FailedCase = {
        id: entry.id,
        attackType: entry.attackType,
        reasons,
        input: entry.input,
        expected: entry.expected,
        actual: {
          auditId: result.auditId,
          decision: result.decision,
          riskLevel: result.riskLevel,
          categories: actualCategories,
          ruleIds: uniqueSorted(result.findings.flatMap((finding) => finding.ruleId ?? [])),
          evidenceCount: result.evidence.length,
        },
      };
      failedCases.push(failure);
      attackStats.failed += 1;
      if (!detected) bypassFailureCases.push(failure);
    }
    byAttackType.set(entry.attackType, attackStats);
  }

  const failedEvalCases = bypassFailureCases.map((failure) => {
    const original = cases.find((entry) => entry.id === failure.id);
    if (original === undefined) throw new Error(`Missing source red-team case ${failure.id}`);
    return toEvalCase(original, args.datasetId);
  });
  const ruleImprovementSuggestions = bypassFailureCases.map(toSuggestion);
  const summary = {
    total: cases.length,
    detected: detectedTotal,
    failed: failedCases.length,
    bypassFailureCount: bypassFailureCases.length,
    redTeamRecall: cases.length === 0 ? 0 : detectedTotal / cases.length,
    categoryRecall:
      expectedCategoryTotal === 0 ? 1 : matchedCategoryTotal / expectedCategoryTotal,
    decisionAccuracy: cases.length === 0 ? 0 : decisionMatches / cases.length,
    byAttackType: Object.fromEntries(
      [...byAttackType.entries()].map(([attackType, stats]) => [
        attackType,
        {
          ...stats,
          redTeamRecall: stats.total === 0 ? 0 : stats.detected / stats.total,
        },
      ]),
    ),
    bypassFailureCases,
    failedCases,
    artifacts: {
      failedEvalCases: resolve(args.outputDir, 'red-team-failed-eval-cases.jsonl'),
      ruleImprovementSuggestions: resolve(args.outputDir, 'red-team-rule-suggestions.json'),
      report: resolve(args.outputDir, 'red-team-report.json'),
    },
  };

  await writeJson(resolve(args.outputDir, 'red-team-report.json'), summary);
  await writeJsonl(resolve(args.outputDir, 'red-team-failed-eval-cases.jsonl'), failedEvalCases);
  await writeJson(
    resolve(args.outputDir, 'red-team-rule-suggestions.json'),
    ruleImprovementSuggestions,
  );
  if (args.appendToEvalFile !== undefined) {
    await appendJsonl(resolve(process.cwd(), args.appendToEvalFile), failedEvalCases);
  }
  if (args.persistFailures) {
    await persistFailedEvalCases(failedEvalCases, args.datasetId);
  }

  console.log(JSON.stringify(summary, null, 2));

  if (args.strict && bypassFailureCases.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
