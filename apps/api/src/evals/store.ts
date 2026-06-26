import type { EvalCaseInput, EvalFailureRecord, EvalRunReport } from '@job-compliance/core';
import { parseEvalJsonl, runEvalDataset } from '@job-compliance/core';
import type {
  CreateEvalDatasetInput,
  EvalDatasetRecord,
  EvalRepository,
} from '@job-compliance/database';

export interface EvalStore extends EvalRepository {
  runDataset(input: {
    datasetId: string;
    ruleVersion?: string;
    lawKbVersion?: string;
    modelVersion?: string;
  }): Promise<EvalRunReport>;
}

export class InMemoryEvalStore implements EvalStore {
  private readonly datasets = new Map<string, EvalDatasetRecord>();
  private readonly cases = new Map<string, EvalCaseInput[]>();
  private readonly runs = new Map<string, EvalRunReport>();

  async createDataset(input: CreateEvalDatasetInput): Promise<EvalDatasetRecord> {
    const record: EvalDatasetRecord = {
      id: input.id,
      name: input.name,
      version: input.version,
      ...(input.description === undefined ? {} : { description: input.description }),
      createdAt: new Date().toISOString(),
    };
    this.datasets.set(record.id, structuredClone(record));
    this.cases.set(record.id, this.cases.get(record.id) ?? []);
    return structuredClone(record);
  }

  async listDatasets(): Promise<EvalDatasetRecord[]> {
    return [...this.datasets.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((entry) => structuredClone(entry));
  }

  async addCases(datasetId: string, cases: readonly EvalCaseInput[]): Promise<EvalCaseInput[]> {
    const existing = this.cases.get(datasetId) ?? [];
    const seen = new Set(existing.map((entry) => entry.id));
    const merged = [
      ...existing,
      ...cases.filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      }),
    ];
    this.cases.set(datasetId, structuredClone(merged));
    return structuredClone(merged);
  }

  async listCases(datasetId: string): Promise<EvalCaseInput[]> {
    return structuredClone(this.cases.get(datasetId) ?? []);
  }

  async saveRun(report: EvalRunReport): Promise<void> {
    this.runs.set(report.id, structuredClone(report));
  }

  async listRuns(): Promise<EvalRunReport[]> {
    return [...this.runs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((entry) => structuredClone(entry));
  }

  async findRun(id: string): Promise<EvalRunReport | undefined> {
    const run = this.runs.get(id);
    return run === undefined ? undefined : structuredClone(run);
  }

  async listFailures(evalRunId: string): Promise<EvalFailureRecord[]> {
    return structuredClone(this.runs.get(evalRunId)?.failures ?? []);
  }

  async runDataset(input: {
    datasetId: string;
    ruleVersion?: string;
    lawKbVersion?: string;
    modelVersion?: string;
  }): Promise<EvalRunReport> {
    const cases = await this.listCases(input.datasetId);
    const report = await runEvalDataset(cases, {
      datasetId: input.datasetId,
      ...(input.ruleVersion === undefined ? {} : { ruleVersion: input.ruleVersion }),
      ...(input.lawKbVersion === undefined ? {} : { lawKbVersion: input.lawKbVersion }),
      ...(input.modelVersion === undefined ? {} : { modelVersion: input.modelVersion }),
    });
    await this.saveRun(report);
    return report;
  }

  async close(): Promise<void> {
    this.datasets.clear();
    this.cases.clear();
    this.runs.clear();
  }
}

export class RepositoryEvalStore implements EvalStore {
  constructor(private readonly repository: EvalRepository) {}

  createDataset(input: CreateEvalDatasetInput): Promise<EvalDatasetRecord> {
    return this.repository.createDataset(input);
  }

  listDatasets(): Promise<EvalDatasetRecord[]> {
    return this.repository.listDatasets();
  }

  addCases(datasetId: string, cases: readonly EvalCaseInput[]): Promise<EvalCaseInput[]> {
    return this.repository.addCases(datasetId, cases);
  }

  listCases(datasetId: string): Promise<EvalCaseInput[]> {
    return this.repository.listCases(datasetId);
  }

  saveRun(report: EvalRunReport): Promise<void> {
    return this.repository.saveRun(report);
  }

  listRuns(): Promise<EvalRunReport[]> {
    return this.repository.listRuns();
  }

  findRun(id: string): Promise<EvalRunReport | undefined> {
    return this.repository.findRun(id);
  }

  listFailures(evalRunId: string): Promise<EvalFailureRecord[]> {
    return this.repository.listFailures(evalRunId);
  }

  async runDataset(input: {
    datasetId: string;
    ruleVersion?: string;
    lawKbVersion?: string;
    modelVersion?: string;
  }): Promise<EvalRunReport> {
    const cases = await this.repository.listCases(input.datasetId);
    const report = await runEvalDataset(cases, {
      datasetId: input.datasetId,
      ...(input.ruleVersion === undefined ? {} : { ruleVersion: input.ruleVersion }),
      ...(input.lawKbVersion === undefined ? {} : { lawKbVersion: input.lawKbVersion }),
      ...(input.modelVersion === undefined ? {} : { modelVersion: input.modelVersion }),
    });
    await this.repository.saveRun(report);
    return report;
  }

  close(): Promise<void> {
    return this.repository.close();
  }
}

export function parseJsonlCases(jsonl: string, datasetId: string): EvalCaseInput[] {
  return parseEvalJsonl(jsonl, datasetId);
}
