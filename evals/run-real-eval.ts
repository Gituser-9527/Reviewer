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
  file: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion: string;
  persist: boolean;
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
    file: String(
      args.get('file') ??
        process.env.REAL_EVAL_DATASET_PATH ??
        resolve(process.cwd(), 'evals', 'datasets', 'job-posting-cases.jsonl'),
    ),
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
    persist: args.has('persist') || process.env.EVAL_PERSIST === 'true',
    strict: args.has('strict') || process.env.EVAL_STRICT === 'true',
  };
}

async function loadCases(file: string, datasetId: string): Promise<EvalCaseInput[]> {
  const content = await readFile(resolve(process.cwd(), file), 'utf8');
  return parseEvalJsonl(content, datasetId);
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

async function persistReport(
  cases: readonly EvalCaseInput[],
  report: EvalRunReport,
): Promise<void> {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
    console.warn('DATABASE_URL is not configured; skipping eval persistence.');
    return;
  }
  const { PostgresEvalRepository } = await import('../packages/database/dist/index.js');
  const repository = new PostgresEvalRepository({ connectionString: process.env.DATABASE_URL });
  try {
    await repository.createDataset({
      id: report.datasetId,
      name: `Real Eval Dataset ${report.datasetId}`,
      version: report.ruleVersion,
      description: 'Imported from redacted JSONL real-job evaluation samples.',
    });
    await repository.addCases(report.datasetId, cases);
    await repository.saveRun(report);
  } finally {
    await repository.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadCases(args.file, args.datasetId);
  const report = await runEvalDataset(cases, {
    datasetId: args.datasetId,
    ...(args.ruleVersion === undefined ? {} : { ruleVersion: args.ruleVersion }),
    ...(args.lawKbVersion === undefined ? {} : { lawKbVersion: args.lawKbVersion }),
    modelVersion: args.modelVersion,
  });

  if (args.persist) {
    await persistReport(cases, report);
  }

  printReport(report);
  if (args.strict && report.failedCases > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
