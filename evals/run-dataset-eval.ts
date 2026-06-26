import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  parseEvalJsonl,
  runEvalDataset,
  type EvalCaseInput,
  type EvalRunReport,
} from '../packages/core/dist/index.js';

interface CliArgs {
  datasetId: string;
  file?: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion: string;
  strict: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args = new Map<string, string | true>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value] = item.slice(2).split('=', 2);
    args.set(key, value ?? true);
  }
  return {
    datasetId: String(args.get('datasetId') ?? process.env.EVAL_DATASET_ID ?? 'real_local'),
    file:
      typeof args.get('file') === 'string'
        ? String(args.get('file'))
        : process.env.REAL_EVAL_DATASET_PATH,
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
    strict: args.has('strict') || process.env.EVAL_STRICT === 'true',
  };
}

async function loadFallbackCases(args: CliArgs): Promise<EvalCaseInput[]> {
  const file = args.file ?? resolve(process.cwd(), 'evals', 'datasets', 'job-posting-cases.jsonl');
  const content = await readFile(resolve(process.cwd(), file), 'utf8');
  return parseEvalJsonl(content, args.datasetId);
}

function printReport(report: EvalRunReport): void {
  console.log(
    JSON.stringify(
      {
        id: report.id,
        datasetId: report.datasetId,
        ruleVersion: report.ruleVersion,
        lawKbVersion: report.lawKbVersion,
        modelVersion: report.modelVersion,
        total: report.totalCases,
        passed: report.passedCases,
        failed: report.failedCases,
        decisionAccuracy: report.decisionAccuracy,
        categoryPrecision: report.categoryPrecision,
        categoryRecall: report.categoryRecall,
        criticalRecall: report.criticalRecall,
        falsePositiveRate: report.falsePositiveRate,
        falseNegativeRate: report.falseNegativeRate,
        manualReviewRate: report.manualReviewRate,
        evidenceAccuracy: report.evidenceAccuracy,
        rewriteSafetyRate: report.rewriteSafetyRate,
        failedCases: report.failures,
      },
      null,
      2,
    ),
  );
}

async function runFromDatabase(args: CliArgs): Promise<EvalRunReport | undefined> {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
    return undefined;
  }
  const { PostgresEvalRepository } = await import('../packages/database/dist/index.js');
  const repository = new PostgresEvalRepository({ connectionString: process.env.DATABASE_URL });
  try {
    const cases = await repository.listCases(args.datasetId);
    if (cases.length === 0) {
      throw new Error(`Dataset ${args.datasetId} has no eval cases.`);
    }
    const report = await runEvalDataset(cases, {
      datasetId: args.datasetId,
      ...(args.ruleVersion === undefined ? {} : { ruleVersion: args.ruleVersion }),
      ...(args.lawKbVersion === undefined ? {} : { lawKbVersion: args.lawKbVersion }),
      modelVersion: args.modelVersion,
    });
    await repository.saveRun(report);
    return report;
  } finally {
    await repository.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report =
    (await runFromDatabase(args)) ??
    (await runEvalDataset(await loadFallbackCases(args), {
      datasetId: args.datasetId,
      ...(args.ruleVersion === undefined ? {} : { ruleVersion: args.ruleVersion }),
      ...(args.lawKbVersion === undefined ? {} : { lawKbVersion: args.lawKbVersion }),
      modelVersion: args.modelVersion,
    }));

  printReport(report);
  if (args.strict && report.failedCases > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
