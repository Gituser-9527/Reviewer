import { randomUUID } from 'node:crypto';
import type { AuditResult } from '@job-compliance/shared';

export const runtimeTargets = ['ruleVersion', 'lawKbVersion', 'modelVersion'] as const;
export type RuntimeTarget = (typeof runtimeTargets)[number];
export type RolloutStatus = 'active' | 'paused' | 'completed' | 'rolled_back';
export type AlertStatus = 'open' | 'resolved';
export type AlertSeverity = 'warning' | 'critical';

export interface RuntimeConfigRecord {
  key: RuntimeTarget;
  stableVersion: string;
  candidateVersion?: string;
  description?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface RuntimeSelection {
  ruleVersion: string;
  lawKbVersion: string;
  modelVersion: string;
  rolloutMatches: string[];
}

export interface RolloutPlanRecord {
  id: string;
  target: RuntimeTarget;
  stableVersion: string;
  candidateVersion: string;
  tenantAllowList: string[];
  rolloutPercent: number;
  status: RolloutStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  description?: string;
}

export interface CreateRolloutPlanInput {
  target: RuntimeTarget;
  stableVersion: string;
  candidateVersion: string;
  tenantAllowList?: string[];
  rolloutPercent?: number;
  createdBy?: string;
  description?: string;
}

export interface UpdateRolloutPlanInput {
  tenantAllowList?: string[];
  rolloutPercent?: number;
  status?: RolloutStatus;
  description?: string;
}

export interface RolloutResolution {
  version: string;
  matchedRolloutId?: string;
}

export interface AuditMetricsEvent {
  tenantId: string;
  decision: AuditResult['decision'];
  riskLevel: AuditResult['riskLevel'];
  ruleVersion: string;
  lawKbVersion: string;
  modelVersion: string;
  findingSeverities: string[];
  ruleIds: string[];
  findingCount: number;
  evidenceCount: number;
  durationMs: number;
  llmError?: boolean;
  ragNoResult?: boolean;
  occurredAt: string;
}

export interface AuditMetricsSnapshot {
  audit_total: number;
  reject_rate: number;
  manual_review_rate: number;
  critical_finding_rate: number;
  rule_hit_by_rule_id: Record<string, number>;
  llm_error_rate: number;
  rag_no_result_rate: number;
  api_error_rate: number;
  p95_latency: number;
  version_distribution: Record<string, number>;
  generatedAt: string;
}

export interface AlertEventRecord {
  id: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  metricKey: string;
  metricValue: number;
  threshold: number;
  message: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AlertThresholds {
  reject_rate: number;
  manual_review_rate: number;
  api_error_rate: number;
  rag_no_result_rate: number;
  llm_error_rate: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function stableTenantBucket(tenantId: string, salt: string): number {
  const text = `${salt}:${tenantId}`;
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export class RolloutService {
  private readonly plans = new Map<string, RolloutPlanRecord>();

  listRollouts(): RolloutPlanRecord[] {
    return [...this.plans.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createRollout(input: CreateRolloutPlanInput): RolloutPlanRecord {
    const timestamp = nowIso();
    const plan: RolloutPlanRecord = {
      id: `rollout_${randomUUID()}`,
      target: input.target,
      stableVersion: input.stableVersion,
      candidateVersion: input.candidateVersion,
      tenantAllowList: input.tenantAllowList ?? [],
      rolloutPercent: clampPercent(input.rolloutPercent ?? 0),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.createdBy === undefined ? {} : { createdBy: input.createdBy }),
      ...(input.description === undefined ? {} : { description: input.description }),
    };
    this.plans.set(plan.id, plan);
    return plan;
  }

  updateRollout(id: string, input: UpdateRolloutPlanInput): RolloutPlanRecord | undefined {
    const existing = this.plans.get(id);
    if (existing === undefined) return undefined;
    const updated: RolloutPlanRecord = {
      ...existing,
      ...(input.tenantAllowList === undefined ? {} : { tenantAllowList: input.tenantAllowList }),
      ...(input.rolloutPercent === undefined
        ? {}
        : { rolloutPercent: clampPercent(input.rolloutPercent) }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.description === undefined ? {} : { description: input.description }),
      updatedAt: nowIso(),
    };
    this.plans.set(id, updated);
    return updated;
  }

  rollbackRollout(id: string): RolloutPlanRecord | undefined {
    return this.updateRollout(id, { status: 'rolled_back', rolloutPercent: 0 });
  }

  resolveVersion(target: RuntimeTarget, stableVersion: string, tenantId: string): RolloutResolution {
    const activePlans = this.listRollouts().filter(
      (plan) => plan.target === target && plan.status === 'active',
    );
    for (const plan of activePlans) {
      const allowListMatch = plan.tenantAllowList.includes(tenantId);
      const percentMatch =
        plan.rolloutPercent > 0 && stableTenantBucket(tenantId, plan.id) < plan.rolloutPercent;
      if (allowListMatch || percentMatch) {
        return { version: plan.candidateVersion, matchedRolloutId: plan.id };
      }
    }
    return { version: stableVersion };
  }
}

export class RuntimeConfigService {
  private readonly configs = new Map<RuntimeTarget, RuntimeConfigRecord>();

  constructor(private readonly rolloutService: RolloutService) {
    this.resetDefaults();
  }

  listConfigs(): RuntimeConfigRecord[] {
    return runtimeTargets.map((target) => this.configs.get(target)).filter(isDefined);
  }

  updateConfig(
    key: RuntimeTarget,
    input: {
      stableVersion?: string;
      candidateVersion?: string;
      description?: string;
      updatedBy?: string;
    },
  ): RuntimeConfigRecord {
    const existing = this.configs.get(key) ?? this.defaultConfig(key);
    const updated: RuntimeConfigRecord = {
      ...existing,
      ...(input.stableVersion === undefined ? {} : { stableVersion: input.stableVersion }),
      ...(input.candidateVersion === undefined ? {} : { candidateVersion: input.candidateVersion }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.updatedBy === undefined ? {} : { updatedBy: input.updatedBy }),
      updatedAt: nowIso(),
    };
    this.configs.set(key, updated);
    return updated;
  }

  resolveForTenant(tenantId: string): RuntimeSelection {
    const matches: string[] = [];
    const rule = this.resolveOne('ruleVersion', tenantId, matches);
    const lawKb = this.resolveOne('lawKbVersion', tenantId, matches);
    const model = this.resolveOne('modelVersion', tenantId, matches);
    return {
      ruleVersion: rule,
      lawKbVersion: lawKb,
      modelVersion: model,
      rolloutMatches: matches,
    };
  }

  private resolveOne(target: RuntimeTarget, tenantId: string, matches: string[]): string {
    const config = this.configs.get(target) ?? this.defaultConfig(target);
    const resolved = this.rolloutService.resolveVersion(target, config.stableVersion, tenantId);
    if (resolved.matchedRolloutId !== undefined) matches.push(resolved.matchedRolloutId);
    return resolved.version;
  }

  private resetDefaults(): void {
    for (const target of runtimeTargets) {
      const config = this.defaultConfig(target);
      this.configs.set(target, config);
    }
  }

  private defaultConfig(key: RuntimeTarget): RuntimeConfigRecord {
    const stableVersion =
      key === 'ruleVersion'
        ? '1.0.0'
        : key === 'lawKbVersion'
          ? 'local-2026-06-12'
          : 'mock-none';
    return {
      key,
      stableVersion,
      updatedAt: nowIso(),
    };
  }
}

export class MetricsService {
  private readonly auditEvents: AuditMetricsEvent[] = [];
  private apiErrorTotal = 0;

  recordAuditResult(result: AuditResult, durationMs: number): AuditMetricsSnapshot {
    const ruleIds = result.findings.flatMap((finding) =>
      finding.ruleId === undefined ? [] : [finding.ruleId],
    );
    const findingSeverities = result.findings.map((finding) => finding.severity);
    const event: AuditMetricsEvent = {
      tenantId: result.context.tenantId,
      decision: result.decision,
      riskLevel: result.riskLevel,
      ruleVersion: result.context.ruleVersion,
      lawKbVersion: result.context.lawKbVersion,
      modelVersion: result.context.modelVersion ?? 'mock-none',
      findingSeverities,
      ruleIds,
      findingCount: result.findings.length,
      evidenceCount: result.evidence.length,
      durationMs: Math.max(0, durationMs),
      ragNoResult: result.findings.length > 0 && result.evidence.length === 0,
      occurredAt: nowIso(),
    };
    this.auditEvents.push(event);
    return this.getAuditMetrics();
  }

  recordApiError(): AuditMetricsSnapshot {
    this.apiErrorTotal += 1;
    return this.getAuditMetrics();
  }

  getAuditMetrics(): AuditMetricsSnapshot {
    const total = this.auditEvents.length;
    const rejectTotal = this.auditEvents.filter((event) => event.decision === 'REJECT').length;
    const manualReviewTotal = this.auditEvents.filter(
      (event) => event.decision === 'MANUAL_REVIEW',
    ).length;
    const criticalTotal = this.auditEvents.filter(
      (event) => event.riskLevel === 'CRITICAL' || event.findingSeverities.includes('CRITICAL'),
    ).length;
    const llmErrorTotal = this.auditEvents.filter((event) => event.llmError === true).length;
    const ragNoResultTotal = this.auditEvents.filter((event) => event.ragNoResult === true).length;
    const ruleHits: Record<string, number> = {};
    const versions: Record<string, number> = {};
    for (const event of this.auditEvents) {
      versions[event.ruleVersion] = (versions[event.ruleVersion] ?? 0) + 1;
      for (const ruleId of event.ruleIds) {
        ruleHits[ruleId] = (ruleHits[ruleId] ?? 0) + 1;
      }
    }
    const latencies = this.auditEvents
      .map((event) => event.durationMs)
      .sort((left, right) => left - right);
    const p95Index = latencies.length === 0 ? -1 : Math.ceil(latencies.length * 0.95) - 1;
    const denominator = Math.max(total, 1);
    const apiDenominator = Math.max(total + this.apiErrorTotal, 1);
    return {
      audit_total: total,
      reject_rate: rejectTotal / denominator,
      manual_review_rate: manualReviewTotal / denominator,
      critical_finding_rate: criticalTotal / denominator,
      rule_hit_by_rule_id: ruleHits,
      llm_error_rate: llmErrorTotal / denominator,
      rag_no_result_rate: ragNoResultTotal / denominator,
      api_error_rate: this.apiErrorTotal / apiDenominator,
      p95_latency: p95Index < 0 ? 0 : (latencies[p95Index] ?? 0),
      version_distribution: versions,
      generatedAt: nowIso(),
    };
  }
}

export class AlertService {
  private readonly events: AlertEventRecord[] = [];

  constructor(
    private readonly thresholds: AlertThresholds = {
      reject_rate: 0.5,
      manual_review_rate: 0.5,
      api_error_rate: 0.1,
      rag_no_result_rate: 0.5,
      llm_error_rate: 0.05,
    },
  ) {}

  evaluate(metrics: AuditMetricsSnapshot): AlertEventRecord[] {
    const created: AlertEventRecord[] = [];
    const checks = [
      ['reject_rate', metrics.reject_rate, '拦截率异常升高'] as const,
      ['manual_review_rate', metrics.manual_review_rate, '人工复核率异常升高'] as const,
      ['api_error_rate', metrics.api_error_rate, 'API 错误率过高'] as const,
      ['rag_no_result_rate', metrics.rag_no_result_rate, 'RAG 无依据率过高'] as const,
      ['llm_error_rate', metrics.llm_error_rate, 'LLM 错误率过高'] as const,
    ];
    for (const [metricKey, metricValue, message] of checks) {
      const threshold = this.thresholds[metricKey];
      if (metricValue <= threshold || this.hasOpenAlert(metricKey)) continue;
      const event: AlertEventRecord = {
        id: `alert_${randomUUID()}`,
        type: 'metric_threshold',
        severity: metricValue >= threshold * 2 ? 'critical' : 'warning',
        status: 'open',
        metricKey,
        metricValue,
        threshold,
        message,
        createdAt: nowIso(),
      };
      this.events.push(event);
      created.push(event);
    }
    return created;
  }

  listAlerts(): AlertEventRecord[] {
    return [...this.events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private hasOpenAlert(metricKey: string): boolean {
    return this.events.some((event) => event.metricKey === metricKey && event.status === 'open');
  }
}

export interface RuntimeServices {
  runtimeConfigService: RuntimeConfigService;
  rolloutService: RolloutService;
  metricsService: MetricsService;
  alertService: AlertService;
}

export function createRuntimeServices(): RuntimeServices {
  const rolloutService = new RolloutService();
  return {
    rolloutService,
    runtimeConfigService: new RuntimeConfigService(rolloutService),
    metricsService: new MetricsService(),
    alertService: new AlertService(),
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
