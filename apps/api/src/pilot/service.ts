import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '@job-compliance/database';
import type { AuditResult, RiskCategory } from '@job-compliance/shared';
import type { AuditRunStore } from '../audit/store.js';
import type { BetaTrialMode, BetaTrialService } from '../beta-trial/service.js';

export type PilotProjectStatus = 'active' | 'completed' | 'paused';
export type RoiReportFormat = 'markdown' | 'pdf';

export interface PilotProject {
  id: string;
  tenantId: string;
  name: string;
  status: PilotProjectStatus;
  modes: BetaTrialMode[];
  startDate: string;
  endDate: string;
  avgReviewTimeBefore: number;
  avgReviewTimeAfter: number;
  hourlyLaborCost: number;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PilotDailyMetrics {
  id: string;
  pilotProjectId: string;
  tenantId: string;
  metricDate: string;
  mode: BetaTrialMode | 'all';
  totalJobsAudited: number;
  autoPassRate: number;
  autoRejectRate: number;
  manualReviewRate: number;
  avgReviewTimeBefore: number;
  avgReviewTimeAfter: number;
  timeSavedHours: number;
  estimatedLaborCostSaved: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  appealRate: number;
  customerSatisfaction: number;
  topRiskCategories: Array<{ category: RiskCategory; count: number }>;
  topRuleHits: Array<{ ruleId: string; count: number }>;
  generatedAt: string;
}

export interface RoiReport {
  id: string;
  pilotProjectId: string;
  tenantId: string;
  reportPeriodStart: string;
  reportPeriodEnd: string;
  totalJobsAudited: number;
  timeSavedHours: number;
  estimatedLaborCostSaved: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  appealRate: number;
  customerSatisfaction: number;
  modeComparison: Record<string, PilotDailyMetrics>;
  risksAndLimitations: string[];
  markdown: string;
  createdAt: string;
}

export interface CustomerFeedback {
  id: string;
  pilotProjectId: string;
  tenantId: string;
  feedbackType: 'satisfaction' | 'risk' | 'feature_request' | 'bug' | 'other';
  rating?: number;
  contactName?: string;
  comment: string;
  createdAt: string;
}

export interface CreatePilotProjectInput {
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  modes?: BetaTrialMode[];
  avgReviewTimeBefore?: number;
  avgReviewTimeAfter?: number;
  hourlyLaborCost?: number;
  description?: string;
  createdBy?: string;
}

export interface AddCustomerFeedbackInput {
  feedbackType: CustomerFeedback['feedbackType'];
  rating?: number;
  contactName?: string;
  comment: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function dayOf(value: string): string {
  return value.slice(0, 10);
}

function betweenDays(value: string, start: string, end: string): boolean {
  const day = dayOf(value);
  return day >= start && day <= end;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function topCounts<T extends string>(
  values: T[],
  limit = 10,
): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function renderPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(project: PilotProject, report: Omit<RoiReport, 'markdown'>): string {
  const modeRows = Object.entries(report.modeComparison)
    .map(
      ([mode, metrics]) =>
        `| ${mode} | ${metrics.totalJobsAudited} | ${renderPercent(metrics.autoPassRate)} | ${renderPercent(metrics.autoRejectRate)} | ${renderPercent(metrics.manualReviewRate)} | ${metrics.timeSavedHours.toFixed(2)} | ${metrics.estimatedLaborCostSaved.toFixed(2)} |`,
    )
    .join('\n');
  return `# ${project.name} 试点 ROI 报告

## 试点范围

- tenantId: \`${project.tenantId}\`
- 周期: ${report.reportPeriodStart} 至 ${report.reportPeriodEnd}
- 模式: ${project.modes.join(', ')}

## 核心指标

- 审核岗位数: ${report.totalJobsAudited}
- 预计节省时间: ${report.timeSavedHours.toFixed(2)} 小时
- 预计节省人工成本: ${report.estimatedLaborCostSaved.toFixed(2)}
- 误杀率: ${renderPercent(report.falsePositiveRate)}
- 漏判率: ${renderPercent(report.falseNegativeRate)}
- 申诉率: ${renderPercent(report.appealRate)}
- 客户满意度: ${report.customerSatisfaction.toFixed(1)} / 5

## 模式对比

| 模式 | 审核量 | 自动通过率 | 自动拦截率 | 人工复核率 | 节省小时 | 节省成本 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${modeRows || '| 暂无数据 | 0 | 0% | 0% | 0% | 0 | 0 |'}

## 风险和限制说明

${report.risksAndLimitations.map((item) => `- ${item}`).join('\n')}
`;
}

export class PilotRoiService {
  private readonly projects = new Map<string, PilotProject>();
  private readonly metrics = new Map<string, PilotDailyMetrics>();
  private readonly reports = new Map<string, RoiReport>();
  private readonly feedback = new Map<string, CustomerFeedback>();

  constructor(
    private readonly dependencies: {
      auditRunStore: AuditRunStore;
      betaTrialService: BetaTrialService;
    },
  ) {}

  createProject(input: CreatePilotProjectInput): PilotProject {
    const timestamp = nowIso();
    const project: PilotProject = {
      id: `pilot_${randomUUID()}`,
      tenantId: input.tenantId,
      name: redactSensitiveText(input.name),
      status: 'active',
      modes: input.modes ?? ['shadow_mode', 'assist_mode'],
      startDate: input.startDate,
      endDate: input.endDate,
      avgReviewTimeBefore: input.avgReviewTimeBefore ?? 6,
      avgReviewTimeAfter: input.avgReviewTimeAfter ?? 2,
      hourlyLaborCost: input.hourlyLaborCost ?? 80,
      ...(input.description === undefined
        ? {}
        : { description: redactSensitiveText(input.description) }),
      createdBy: input.createdBy ?? 'pilot_operator',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.projects.set(project.id, structuredClone(project));
    return structuredClone(project);
  }

  listProjects(options: { tenantId?: string } = {}): PilotProject[] {
    return [...this.projects.values()]
      .filter((project) => options.tenantId === undefined || project.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((project) => structuredClone(project));
  }

  findProject(id: string): PilotProject | undefined {
    const project = this.projects.get(id);
    return project === undefined ? undefined : structuredClone(project);
  }

  async getDashboard(id: string): Promise<
    | {
        project: PilotProject;
        dailyMetrics: PilotDailyMetrics[];
        report: RoiReport;
        feedback: CustomerFeedback[];
      }
    | undefined
  > {
    const project = this.projects.get(id);
    if (project === undefined) return undefined;
    const dailyMetrics = await this.generateDailyMetrics(project);
    const report = await this.generateReport(project.id);
    return {
      project: structuredClone(project),
      dailyMetrics,
      report,
      feedback: this.listFeedback({ pilotProjectId: project.id }),
    };
  }

  async generateReport(projectId: string): Promise<RoiReport> {
    const project = this.projects.get(projectId);
    if (project === undefined) {
      throw new Error('PILOT_PROJECT_NOT_FOUND');
    }
    const dailyMetrics = await this.generateDailyMetrics(project);
    const modeComparison = Object.fromEntries(
      project.modes.map((mode) => [mode, this.aggregateMetrics(project, dailyMetrics, mode)]),
    );
    const allMetrics = this.aggregateMetrics(project, dailyMetrics, 'all');
    const reportBase: Omit<RoiReport, 'markdown'> = {
      id: `roi_${randomUUID()}`,
      pilotProjectId: project.id,
      tenantId: project.tenantId,
      reportPeriodStart: project.startDate,
      reportPeriodEnd: project.endDate,
      totalJobsAudited: allMetrics.totalJobsAudited,
      timeSavedHours: allMetrics.timeSavedHours,
      estimatedLaborCostSaved: allMetrics.estimatedLaborCostSaved,
      falsePositiveRate: allMetrics.falsePositiveRate,
      falseNegativeRate: allMetrics.falseNegativeRate,
      appealRate: allMetrics.appealRate,
      customerSatisfaction: allMetrics.customerSatisfaction,
      modeComparison,
      risksAndLimitations: [
        'ROI 为试点估算值，依赖人工复核反馈完整度和试点样本代表性。',
        'shadow_mode 不直接影响线上业务，其节省时间为模拟测算。',
        '误杀率、漏判率需要持续用人工复核和申诉结果校准。',
        '报告不构成法律意见，只用于评估审核辅助系统的业务价值。',
      ],
      createdAt: nowIso(),
    };
    const report: RoiReport = {
      ...reportBase,
      markdown: renderMarkdown(project, reportBase),
    };
    this.reports.set(report.id, structuredClone(report));
    return structuredClone(report);
  }

  listReports(options: { pilotProjectId?: string } = {}): RoiReport[] {
    return [...this.reports.values()]
      .filter(
        (report) =>
          options.pilotProjectId === undefined || report.pilotProjectId === options.pilotProjectId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((report) => structuredClone(report));
  }

  async exportReport(projectId: string, format: RoiReportFormat): Promise<{
    fileName: string;
    contentType: string;
    body: string;
  }> {
    const report = await this.generateReport(projectId);
    const extension = format === 'pdf' ? 'pdf' : 'md';
    const contentType = format === 'pdf' ? 'application/pdf' : 'text/markdown; charset=utf-8';
    const body =
      format === 'pdf'
        ? `%PDF-1.4\n% MVP text report placeholder\n${report.markdown}\n%%EOF`
        : report.markdown;
    return {
      fileName: `pilot-roi-${projectId}.${extension}`,
      contentType,
      body,
    };
  }

  addFeedback(projectId: string, input: AddCustomerFeedbackInput): CustomerFeedback | undefined {
    const project = this.projects.get(projectId);
    if (project === undefined) return undefined;
    const feedback: CustomerFeedback = {
      id: `customer_feedback_${randomUUID()}`,
      pilotProjectId: project.id,
      tenantId: project.tenantId,
      feedbackType: input.feedbackType,
      ...(input.rating === undefined ? {} : { rating: input.rating }),
      ...(input.contactName === undefined
        ? {}
        : { contactName: redactSensitiveText(input.contactName) }),
      comment: redactSensitiveText(input.comment),
      createdAt: nowIso(),
    };
    this.feedback.set(feedback.id, structuredClone(feedback));
    return structuredClone(feedback);
  }

  listFeedback(options: { pilotProjectId?: string; tenantId?: string } = {}): CustomerFeedback[] {
    return [...this.feedback.values()]
      .filter(
        (item) =>
          options.pilotProjectId === undefined || item.pilotProjectId === options.pilotProjectId,
      )
      .filter((item) => options.tenantId === undefined || item.tenantId === options.tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => structuredClone(item));
  }

  private async generateDailyMetrics(project: PilotProject): Promise<PilotDailyMetrics[]> {
    const days = this.daysInRange(project.startDate, project.endDate);
    const metrics = (
      await Promise.all(
        days.map(async (day) => [
          await this.metricsFor(project, day, 'all'),
          ...(await Promise.all(project.modes.map((mode) => this.metricsFor(project, day, mode)))),
        ]),
      )
    ).flat();
    for (const metric of metrics) this.metrics.set(metric.id, structuredClone(metric));
    return metrics.map((metric) => structuredClone(metric));
  }

  private async metricsFor(
    project: PilotProject,
    metricDate: string,
    mode: BetaTrialMode | 'all',
  ): Promise<PilotDailyMetrics> {
    const runs = this.dependencies.betaTrialService.listRuns({
      tenantId: project.tenantId,
      ...(mode === 'all' ? {} : { mode }),
    }).filter((run) => dayOf(run.createdAt) === metricDate);
    const auditRuns = (await this.auditRunsFor(project)).filter(
      (run) => dayOf(run.createdAt) === metricDate,
    );
    const scopedAuditRuns =
      mode === 'all'
        ? auditRuns
        : auditRuns.filter((run) => runs.some((trial) => trial.auditRunId === run.auditId));
    const total = scopedAuditRuns.length;
    const autoPass = scopedAuditRuns.filter((run) => run.decision === 'PASS').length;
    const autoReject = scopedAuditRuns.filter((run) => run.decision === 'REJECT').length;
    const manual = scopedAuditRuns.filter((run) => run.decision === 'MANUAL_REVIEW').length;
    const compared = runs.filter((run) => run.comparisonResult !== 'PENDING');
    const feedback = this.listFeedback({ pilotProjectId: project.id });
    const satisfaction = avg(feedback.flatMap((item) => (item.rating === undefined ? [] : [item.rating])));
    const timeSavedHours = Math.max(
      0,
      ((project.avgReviewTimeBefore - project.avgReviewTimeAfter) *
        (autoPass + autoReject + compared.filter((run) => run.comparisonResult === 'AGREE').length)) /
        60,
    );
    const ruleIds = scopedAuditRuns.flatMap((run) =>
      run.findings.flatMap((finding) => (finding.ruleId === undefined ? [] : [finding.ruleId])),
    );
    return {
      id: `pilot_metric_${project.id}_${metricDate}_${mode}`,
      pilotProjectId: project.id,
      tenantId: project.tenantId,
      metricDate,
      mode,
      totalJobsAudited: total,
      autoPassRate: round(ratio(autoPass, total)),
      autoRejectRate: round(ratio(autoReject, total)),
      manualReviewRate: round(ratio(manual, total)),
      avgReviewTimeBefore: project.avgReviewTimeBefore,
      avgReviewTimeAfter: project.avgReviewTimeAfter,
      timeSavedHours: round(timeSavedHours, 2),
      estimatedLaborCostSaved: round(timeSavedHours * project.hourlyLaborCost, 2),
      falsePositiveRate: round(ratio(runs.filter((run) => run.falsePositive).length, compared.length)),
      falseNegativeRate: round(ratio(runs.filter((run) => run.falseNegative).length, compared.length)),
      appealRate: round(ratio(feedback.filter((item) => item.feedbackType === 'risk').length, Math.max(total, 1))),
      customerSatisfaction: round(satisfaction, 1),
      topRiskCategories: topCounts(
        scopedAuditRuns.flatMap((run) => run.findings.map((finding) => finding.category)),
      ).map(({ value, count }) => ({ category: value, count })),
      topRuleHits: topCounts(ruleIds).map(({ value, count }) => ({ ruleId: value, count })),
      generatedAt: nowIso(),
    };
  }

  private aggregateMetrics(
    project: PilotProject,
    dailyMetrics: PilotDailyMetrics[],
    mode: BetaTrialMode | 'all',
  ): PilotDailyMetrics {
    const scoped = dailyMetrics.filter((metric) => metric.mode === mode);
    const total = sum(scoped.map((metric) => metric.totalJobsAudited));
    const weighted = (selector: (metric: PilotDailyMetrics) => number) =>
      total === 0
        ? 0
        : sum(scoped.map((metric) => selector(metric) * metric.totalJobsAudited)) / total;
    const topRiskCategories = topCounts(
      scoped.flatMap((metric) =>
        metric.topRiskCategories.flatMap((entry) => Array.from({ length: entry.count }, () => entry.category)),
      ),
    ).map(({ value, count }) => ({ category: value, count }));
    const topRuleHits = topCounts(
      scoped.flatMap((metric) =>
        metric.topRuleHits.flatMap((entry) => Array.from({ length: entry.count }, () => entry.ruleId)),
      ),
    ).map(({ value, count }) => ({ ruleId: value, count }));
    return {
      id: `pilot_metric_${project.id}_aggregate_${mode}`,
      pilotProjectId: project.id,
      tenantId: project.tenantId,
      metricDate: `${project.startDate}_${project.endDate}`,
      mode,
      totalJobsAudited: total,
      autoPassRate: round(weighted((metric) => metric.autoPassRate)),
      autoRejectRate: round(weighted((metric) => metric.autoRejectRate)),
      manualReviewRate: round(weighted((metric) => metric.manualReviewRate)),
      avgReviewTimeBefore: project.avgReviewTimeBefore,
      avgReviewTimeAfter: project.avgReviewTimeAfter,
      timeSavedHours: round(sum(scoped.map((metric) => metric.timeSavedHours)), 2),
      estimatedLaborCostSaved: round(sum(scoped.map((metric) => metric.estimatedLaborCostSaved)), 2),
      falsePositiveRate: round(weighted((metric) => metric.falsePositiveRate)),
      falseNegativeRate: round(weighted((metric) => metric.falseNegativeRate)),
      appealRate: round(weighted((metric) => metric.appealRate)),
      customerSatisfaction: round(
        avg(scoped.flatMap((metric) => (metric.customerSatisfaction === 0 ? [] : [metric.customerSatisfaction]))),
        1,
      ),
      topRiskCategories,
      topRuleHits,
      generatedAt: nowIso(),
    };
  }

  private async auditRunsFor(project: PilotProject): Promise<AuditResult[]> {
    const runs = this.dependencies.auditRunStore.listByTenant(project.tenantId);
    const resolved = runs instanceof Promise ? await runs : runs;
    return resolved.filter((run) => betweenDays(run.createdAt, project.startDate, project.endDate));
  }

  private daysInRange(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    return days;
  }
}
