import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { AuthContext } from '../auth/service.js';
import type { EvalStore } from '../evals/store.js';
import type { RuntimeServices, RuntimeTarget } from '../runtime/services.js';

export const releaseTargets = [
  'ruleVersion',
  'lawKbVersion',
  'modelVersion',
  'promptVersion',
] as const;

export type ReleaseTarget = (typeof releaseTargets)[number];
export type ReleaseCandidateStatus =
  | 'draft'
  | 'gates_failed'
  | 'gates_passed'
  | 'approved'
  | 'published';
export type ReleaseGateCheckStatus = 'pass' | 'fail' | 'skipped';

export interface ReleaseQualityMetrics {
  criticalRecall?: number;
  falseNegativeRate?: number;
  falsePositiveRate?: number;
  evidenceAccuracy?: number;
  rewriteSafetyRate?: number;
  redTeamRecall?: number;
  predictedRejectRateChange?: number;
}

export interface ReleaseCandidateRecord {
  id: string;
  name: string;
  target: ReleaseTarget;
  targetVersion: string;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion?: string;
  promptVersion?: string;
  evalDatasetId?: string;
  description?: string;
  status: ReleaseCandidateStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  qualityMetrics: ReleaseQualityMetrics;
}

export interface ReleaseGateThresholds {
  criticalRecall: number;
  falseNegativeRate: number;
  evidenceAccuracy: number;
  rewriteSafetyRate: number;
  redTeamRecall: number;
  maxFalsePositiveRate: number;
  maxPredictedRejectRateChange: number;
}

export interface ReleaseGateCheckRecord {
  id: string;
  candidateId: string;
  checkKey: string;
  title: string;
  status: ReleaseGateCheckStatus;
  required: boolean;
  threshold?: number;
  actual?: number | string | boolean;
  detail: string;
  durationMs: number;
  createdAt: string;
}

export interface ReleaseGateResultRecord {
  id: string;
  candidateId: string;
  status: 'passed' | 'failed';
  checks: ReleaseGateCheckRecord[];
  thresholds: ReleaseGateThresholds;
  createdAt: string;
}

export interface ReleaseApprovalRecord {
  id: string;
  candidateId: string;
  status: 'approved';
  approvedBy: string;
  comment?: string;
  createdAt: string;
}

export interface ReleasePublishResult {
  candidate: ReleaseCandidateRecord;
  gateResult: ReleaseGateResultRecord;
  approval: ReleaseApprovalRecord;
  rolloutPlanIds: string[];
  forcePublished: boolean;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type CommandRunner = (input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}) => Promise<CommandResult>;

const defaultThresholds: ReleaseGateThresholds = {
  criticalRecall: 0.95,
  falseNegativeRate: 0.02,
  evidenceAccuracy: 0.9,
  rewriteSafetyRate: 0.95,
  redTeamRecall: 0.85,
  maxFalsePositiveRate: 0.1,
  maxPredictedRejectRateChange: 0.15,
};

const runtimeTargetByReleaseTarget: Partial<Record<ReleaseTarget, RuntimeTarget>> = {
  ruleVersion: 'ruleVersion',
  lawKbVersion: 'lawKbVersion',
  modelVersion: 'modelVersion',
};

function nowIso(): string {
  return new Date().toISOString();
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export const defaultCommandRunner: CommandRunner = async (input) => {
  const started = Date.now();
  return await new Promise<CommandResult>((resolvePromise) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, input.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolvePromise({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        durationMs: Date.now() - started,
      });
    });
  });
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function metricPass(
  value: number | undefined,
  threshold: number,
  direction: 'gte' | 'lte',
): boolean {
  if (value === undefined || Number.isNaN(value)) return false;
  return direction === 'gte' ? value >= threshold : value <= threshold;
}

function pickVersion(input: {
  target: ReleaseTarget;
  ruleVersion?: string;
  lawKbVersion?: string;
  modelVersion?: string;
  promptVersion?: string;
}): string {
  const version = input[input.target];
  if (version === undefined || version.trim() === '') {
    throw new ReleaseGateError('VERSION_REQUIRED', `${input.target} is required.`);
  }
  return version;
}

function compactOutput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 500) return trimmed;
  return trimmed.slice(Math.max(0, trimmed.length - 500));
}

async function readRedTeamRecall(reportPath: string): Promise<number | undefined> {
  const content = await readFile(reportPath, 'utf8').catch(() => undefined);
  if (content === undefined) return undefined;
  const parsed = JSON.parse(content) as { redTeamRecall?: unknown };
  return typeof parsed.redTeamRecall === 'number' ? parsed.redTeamRecall : undefined;
}

export class ReleaseGateError extends Error {
  constructor(
    readonly code:
      | 'RELEASE_CANDIDATE_NOT_FOUND'
      | 'RELEASE_GATE_FAILED'
      | 'RELEASE_APPROVAL_REQUIRED'
      | 'FORCE_PUBLISH_FORBIDDEN'
      | 'VERSION_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'ReleaseGateError';
  }
}

export interface ReleaseQualityGateServiceOptions {
  cwd?: string;
  commandRunner?: CommandRunner;
  evalStore?: EvalStore;
  runtimeServices?: RuntimeServices;
  thresholds?: Partial<ReleaseGateThresholds>;
  commandTimeoutMs?: number;
}

export class ReleaseQualityGateService {
  private readonly candidates = new Map<string, ReleaseCandidateRecord>();
  private readonly gateResults = new Map<string, ReleaseGateResultRecord[]>();
  private readonly approvals = new Map<string, ReleaseApprovalRecord[]>();
  private readonly commandRunner: CommandRunner;
  private readonly cwd: string;
  private readonly thresholds: ReleaseGateThresholds;
  private readonly commandTimeoutMs: number;

  constructor(private readonly options: ReleaseQualityGateServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.thresholds = { ...defaultThresholds, ...options.thresholds };
    this.commandTimeoutMs = options.commandTimeoutMs ?? 120_000;
  }

  listCandidates(): ReleaseCandidateRecord[] {
    return [...this.candidates.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  createCandidate(input: {
    name: string;
    target: ReleaseTarget;
    ruleVersion?: string;
    lawKbVersion?: string;
    modelVersion?: string;
    promptVersion?: string;
    evalDatasetId?: string;
    description?: string;
    createdBy?: string;
    qualityMetrics?: ReleaseQualityMetrics;
  }): ReleaseCandidateRecord {
    const timestamp = nowIso();
    const targetVersion = pickVersion(input);
    const candidate: ReleaseCandidateRecord = {
      id: `release_candidate_${randomUUID()}`,
      name: input.name,
      target: input.target,
      targetVersion,
      ...(input.ruleVersion === undefined ? {} : { ruleVersion: input.ruleVersion }),
      ...(input.lawKbVersion === undefined ? {} : { lawKbVersion: input.lawKbVersion }),
      ...(input.modelVersion === undefined ? {} : { modelVersion: input.modelVersion }),
      ...(input.promptVersion === undefined ? {} : { promptVersion: input.promptVersion }),
      ...(input.evalDatasetId === undefined ? {} : { evalDatasetId: input.evalDatasetId }),
      ...(input.description === undefined ? {} : { description: input.description }),
      status: 'draft',
      createdBy: input.createdBy ?? 'release_operator',
      createdAt: timestamp,
      updatedAt: timestamp,
      qualityMetrics: input.qualityMetrics ?? {},
    };
    this.candidates.set(candidate.id, clone(candidate));
    return clone(candidate);
  }

  getCandidate(id: string): ReleaseCandidateRecord | undefined {
    const candidate = this.candidates.get(id);
    return candidate === undefined ? undefined : clone(candidate);
  }

  getGateResults(candidateId: string): ReleaseGateResultRecord[] {
    return (this.gateResults.get(candidateId) ?? [])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  getApprovals(candidateId: string): ReleaseApprovalRecord[] {
    return (this.approvals.get(candidateId) ?? [])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async runGates(candidateId: string): Promise<ReleaseGateResultRecord> {
    const candidate = this.requireCandidate(candidateId);
    const checks: ReleaseGateCheckRecord[] = [];
    const metrics: ReleaseQualityMetrics = { ...candidate.qualityMetrics };

    checks.push(await this.runCommandCheck(candidate, 'build', 'Build 是否通过', ['run', 'build']));
    checks.push(await this.runCommandCheck(candidate, 'unit_test', 'Unit test 是否通过', ['test']));

    const evalCheck = await this.runEvalCheck(candidate, metrics);
    checks.push(evalCheck);
    const redTeamCheck = await this.runRedTeamCheck(candidate, metrics);
    checks.push(redTeamCheck);

    checks.push(
      this.metricCheck(candidate, 'critical_recall', 'Critical recall 是否达标', metrics.criticalRecall, this.thresholds.criticalRecall, 'gte'),
      this.metricCheck(candidate, 'false_negative_rate', 'False negative rate 是否低于阈值', metrics.falseNegativeRate, this.thresholds.falseNegativeRate, 'lte'),
      this.metricCheck(candidate, 'false_positive_rate', 'False positive rate 是否低于阈值', metrics.falsePositiveRate, this.thresholds.maxFalsePositiveRate, 'lte'),
      this.metricCheck(candidate, 'evidence_accuracy', 'Evidence accuracy 是否达标', metrics.evidenceAccuracy, this.thresholds.evidenceAccuracy, 'gte'),
      this.metricCheck(candidate, 'rewrite_safety_rate', 'Rewrite safety rate 是否达标', metrics.rewriteSafetyRate, this.thresholds.rewriteSafetyRate, 'gte'),
      this.metricCheck(candidate, 'red_team_recall', 'Red team recall 是否达标', metrics.redTeamRecall, this.thresholds.redTeamRecall, 'gte'),
      this.metricCheck(
        candidate,
        'predicted_reject_rate_change',
        'Reject rate 预测变化是否异常',
        metrics.predictedRejectRateChange ?? 0,
        this.thresholds.maxPredictedRejectRateChange,
        'lte',
      ),
      this.approvalCheck(candidate),
    );

    const failed = checks.some((check) => check.required && check.status !== 'pass');
    const result: ReleaseGateResultRecord = {
      id: `release_gate_result_${randomUUID()}`,
      candidateId,
      status: failed ? 'failed' : 'passed',
      checks,
      thresholds: this.thresholds,
      createdAt: nowIso(),
    };
    const results = this.gateResults.get(candidateId) ?? [];
    results.push(clone(result));
    this.gateResults.set(candidateId, results);
    this.updateCandidate(candidateId, {
      qualityMetrics: metrics,
      status: failed ? 'gates_failed' : 'gates_passed',
    });
    return clone(result);
  }

  approveCandidate(
    candidateId: string,
    input: { approvedBy: string; comment?: string },
  ): ReleaseApprovalRecord {
    this.requireCandidate(candidateId);
    const approval: ReleaseApprovalRecord = {
      id: `release_approval_${randomUUID()}`,
      candidateId,
      status: 'approved',
      approvedBy: input.approvedBy,
      ...(input.comment === undefined ? {} : { comment: input.comment }),
      createdAt: nowIso(),
    };
    const approvals = this.approvals.get(candidateId) ?? [];
    approvals.push(clone(approval));
    this.approvals.set(candidateId, approvals);
    this.updateCandidate(candidateId, { status: 'approved' });
    return clone(approval);
  }

  publishCandidate(
    candidateId: string,
    input: { actor: AuthContext; forcePublish?: boolean },
  ): ReleasePublishResult {
    const candidate = this.requireCandidate(candidateId);
    const forcePublish = input.forcePublish === true;
    const gateResult = this.getGateResults(candidateId)[0];
    const approval = this.getApprovals(candidateId)[0];
    if (approval === undefined) {
      throw new ReleaseGateError('RELEASE_APPROVAL_REQUIRED', 'Release approval is required.');
    }
    if (gateResult === undefined || gateResult.status !== 'passed') {
      if (!forcePublish) {
        throw new ReleaseGateError('RELEASE_GATE_FAILED', 'Release quality gate has not passed.');
      }
      if (input.actor.role !== 'COMPLIANCE_MANAGER' && input.actor.role !== 'SUPER_ADMIN') {
        throw new ReleaseGateError(
          'FORCE_PUBLISH_FORBIDDEN',
          'Force publish requires COMPLIANCE_MANAGER permission.',
        );
      }
    }

    const rolloutPlanIds = this.createRolloutPlans(candidate);
    const published = this.updateCandidate(candidateId, { status: 'published' });
    return {
      candidate: published,
      gateResult: gateResult ?? this.forceGateResult(candidate),
      approval,
      rolloutPlanIds,
      forcePublished: forcePublish,
    };
  }

  private async runCommandCheck(
    candidate: ReleaseCandidateRecord,
    key: string,
    title: string,
    args: string[],
  ): Promise<ReleaseGateCheckRecord> {
    const result = await this.commandRunner({
      command: npmCommand(),
      args,
      cwd: this.cwd,
      timeoutMs: this.commandTimeoutMs,
    });
    return this.commandCheck(candidate, key, title, result);
  }

  private commandCheck(
    candidate: ReleaseCandidateRecord,
    key: string,
    title: string,
    result: CommandResult,
  ): ReleaseGateCheckRecord {
    return {
      id: `release_gate_check_${randomUUID()}`,
      candidateId: candidate.id,
      checkKey: key,
      title,
      status: result.exitCode === 0 ? 'pass' : 'fail',
      required: true,
      actual: result.exitCode,
      detail:
        result.exitCode === 0
          ? 'Command completed successfully.'
          : compactOutput(`${result.stderr}\n${result.stdout}`) || 'Command failed.',
      durationMs: result.durationMs,
      createdAt: nowIso(),
    };
  }

  private async runEvalCheck(
    candidate: ReleaseCandidateRecord,
    metrics: ReleaseQualityMetrics,
  ): Promise<ReleaseGateCheckRecord> {
    if (this.options.evalStore !== undefined && candidate.evalDatasetId !== undefined) {
      const started = Date.now();
      const report = await this.options.evalStore.runDataset({
        datasetId: candidate.evalDatasetId,
        ...(candidate.ruleVersion === undefined ? {} : { ruleVersion: candidate.ruleVersion }),
        ...(candidate.lawKbVersion === undefined ? {} : { lawKbVersion: candidate.lawKbVersion }),
        ...(candidate.modelVersion === undefined ? {} : { modelVersion: candidate.modelVersion }),
      });
      metrics.criticalRecall = report.criticalRecall;
      metrics.falseNegativeRate = report.falseNegativeRate;
      metrics.falsePositiveRate = report.falsePositiveRate;
      metrics.evidenceAccuracy = report.evidenceAccuracy;
      metrics.rewriteSafetyRate = report.rewriteSafetyRate;
      return {
        id: `release_gate_check_${randomUUID()}`,
        candidateId: candidate.id,
        checkKey: 'eval',
        title: 'Eval 是否通过',
        status: report.failedCases === 0 ? 'pass' : 'fail',
        required: true,
        actual: report.failedCases,
        detail: `Dataset ${candidate.evalDatasetId} total=${report.totalCases}, failed=${report.failedCases}.`,
        durationMs: Date.now() - started,
        createdAt: nowIso(),
      };
    }

    return this.runCommandCheck(candidate, 'eval', 'Eval 是否通过', ['run', 'eval']);
  }

  private async runRedTeamCheck(
    candidate: ReleaseCandidateRecord,
    metrics: ReleaseQualityMetrics,
  ): Promise<ReleaseGateCheckRecord> {
    const result = await this.commandRunner({
      command: npmCommand(),
      args: ['run', 'eval:redteam'],
      cwd: this.cwd,
      timeoutMs: this.commandTimeoutMs,
    });
    const reportPath = resolve(this.cwd, 'evals', 'red-team', 'output', 'red-team-report.json');
    const redTeamRecall = await readRedTeamRecall(reportPath);
    if (redTeamRecall !== undefined) {
      metrics.redTeamRecall = redTeamRecall;
    }
    return {
      id: `release_gate_check_${randomUUID()}`,
      candidateId: candidate.id,
      checkKey: 'red_team_eval',
      title: 'Red team eval 是否可运行',
      status: result.exitCode === 0 ? 'pass' : 'fail',
      required: true,
      ...(metrics.redTeamRecall === undefined ? {} : { actual: metrics.redTeamRecall }),
      detail:
        result.exitCode === 0
          ? `Red team completed. recall=${metrics.redTeamRecall ?? 'unavailable'}.`
          : compactOutput(`${result.stderr}\n${result.stdout}`) || 'Red team command failed.',
      durationMs: result.durationMs,
      createdAt: nowIso(),
    };
  }

  private metricCheck(
    candidate: ReleaseCandidateRecord,
    key: string,
    title: string,
    actual: number | undefined,
    threshold: number,
    direction: 'gte' | 'lte',
  ): ReleaseGateCheckRecord {
    return {
      id: `release_gate_check_${randomUUID()}`,
      candidateId: candidate.id,
      checkKey: key,
      title,
      status: metricPass(actual, threshold, direction) ? 'pass' : 'fail',
      required: true,
      threshold,
      ...(actual === undefined ? {} : { actual }),
      detail:
        actual === undefined
          ? 'Metric is unavailable; release cannot proceed.'
          : `${actual} ${direction === 'gte' ? '>=' : '<='} ${threshold}`,
      durationMs: 0,
      createdAt: nowIso(),
    };
  }

  private approvalCheck(candidate: ReleaseCandidateRecord): ReleaseGateCheckRecord {
    const approved = this.getApprovals(candidate.id).length > 0;
    return {
      id: `release_gate_check_${randomUUID()}`,
      candidateId: candidate.id,
      checkKey: 'approval_record',
      title: '是否有人工审批记录',
      status: approved ? 'pass' : 'fail',
      required: true,
      actual: approved,
      detail: approved ? 'Approval record exists.' : 'Approval record is missing.',
      durationMs: 0,
      createdAt: nowIso(),
    };
  }

  private createRolloutPlans(candidate: ReleaseCandidateRecord): string[] {
    const runtimeTarget = runtimeTargetByReleaseTarget[candidate.target];
    if (runtimeTarget === undefined || this.options.runtimeServices === undefined) return [];
    const currentConfig = this.options.runtimeServices.runtimeConfigService
      .listConfigs()
      .find((config) => config.key === runtimeTarget);
    const stableVersion = currentConfig?.stableVersion ?? candidate.targetVersion;
    this.options.runtimeServices.runtimeConfigService.updateConfig(runtimeTarget, {
      candidateVersion: candidate.targetVersion,
      updatedBy: 'release_gate',
    });
    const rollout = this.options.runtimeServices.rolloutService.createRollout({
      target: runtimeTarget,
      stableVersion,
      candidateVersion: candidate.targetVersion,
      rolloutPercent: 0,
      createdBy: 'release_gate',
      description: `Created from release candidate ${candidate.id}.`,
    });
    return [rollout.id];
  }

  private requireCandidate(id: string): ReleaseCandidateRecord {
    const candidate = this.candidates.get(id);
    if (candidate === undefined) {
      throw new ReleaseGateError(
        'RELEASE_CANDIDATE_NOT_FOUND',
        'Release candidate was not found.',
      );
    }
    return clone(candidate);
  }

  private updateCandidate(
    id: string,
    patch: Partial<Pick<ReleaseCandidateRecord, 'status' | 'qualityMetrics'>>,
  ): ReleaseCandidateRecord {
    const existing = this.requireCandidate(id);
    const updated: ReleaseCandidateRecord = {
      ...existing,
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.qualityMetrics === undefined ? {} : { qualityMetrics: patch.qualityMetrics }),
      updatedAt: nowIso(),
    };
    this.candidates.set(id, clone(updated));
    return clone(updated);
  }

  private forceGateResult(candidate: ReleaseCandidateRecord): ReleaseGateResultRecord {
    return {
      id: `release_gate_result_force_${randomUUID()}`,
      candidateId: candidate.id,
      status: 'failed',
      checks: [],
      thresholds: this.thresholds,
      createdAt: nowIso(),
    };
  }
}
