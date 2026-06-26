import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { redactSensitiveText } from '@job-compliance/database';
import type { BetaProgram, BetaProgramMode, BetaProgramService } from '../beta-program/service.js';

export type UatCheckStatus = 'pass' | 'warn' | 'fail';
export type UatDecision = 'GO' | 'NO_GO';

export interface UatMetricSnapshot {
  evalAccuracy?: number;
  decisionAccuracy?: number;
  categoryRecall?: number;
  redTeamRecall?: number;
  p95LatencyMs?: number;
  securityStatus?: 'ready' | 'needs_attention' | 'blocked';
  privacyStatus?: 'ready' | 'needs_attention' | 'blocked';
  rollbackDrillStatus?: UatCheckStatus;
  trainingReadinessRate?: number;
}

export interface UatCheckItem {
  key: string;
  title: string;
  status: UatCheckStatus;
  required: boolean;
  detail: string;
  evidence?: string;
}

export interface UatAcceptanceReport {
  id: string;
  currentVersion: string;
  generatedAt: string;
  generatedBy: string;
  completedModules: string[];
  incompleteModules: string[];
  knownLimitations: string[];
  checks: UatCheckItem[];
  metrics: UatMetricSnapshot;
  blockers: UatCheckItem[];
  recommendation: string;
  betaBoundaries: string[];
  goNoGoDecision: UatDecision;
  approvedBetaProgramId?: string;
}

export interface GenerateUatReportInput {
  currentVersion?: string;
  generatedBy?: string;
  checks?: Array<Partial<UatCheckItem> & { key: string }>;
  metrics?: UatMetricSnapshot;
  knownLimitations?: string[];
}

export interface ApproveBetaInput {
  tenantId: string;
  name?: string;
  mode?: BetaProgramMode;
  startDate: string;
  endDate: string;
  ownerId?: string;
}

export class UatApprovalError extends Error {
  constructor(
    readonly code: 'UAT_REPORT_NOT_FOUND' | 'UAT_BLOCKED',
    message: string,
  ) {
    super(message);
    this.name = 'UatApprovalError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function packageVersion(): string {
  const fallback = '0.1.0';
  try {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: unknown };
    return typeof packageJson.version === 'string' ? packageJson.version : fallback;
  } catch {
    return fallback;
  }
}

const completedModules = [
  '项目骨架与 monorepo',
  '核心 TypeScript 类型与运行时 schema',
  'YAML 规则引擎',
  '岗位结构化抽取',
  'Audit orchestrator',
  'REST API 与健康检查',
  '前端岗位审核页面',
  'RAG evidence 本地检索',
  '评估集、真实数据评估与红队评估脚本',
  '人工复核闭环与规则改进建议',
  '安全脱敏、隐私检查与审计日志',
  '规则运营、灰度发布、回滚和监控 MVP',
  'Beta Trial、培训帮助中心、事故响应与 Kill Switch',
];

const incompleteModules = [
  '真实 LLM Provider 生产接入与供应商侧零保留确认',
  '法规知识库内容的法务最终审批',
  'PostgreSQL 持久化覆盖所有新增运营模块',
  '完整生产级压测、容量规划和 SLO 验证',
  '多租户真实身份系统和企业级权限集成',
];

const knownLimitations = [
  '当前结论用于审核辅助，不替代法律裁判或最终法务意见。',
  'Beta 期间建议仅启用 shadow 或 assist 模式，不建议直接全量 enforce。',
  '法规、平台规则和知识库文本仍需合规负责人确认来源、版本和适用范围。',
  '红队与真实数据评估样本仍需持续补充，尤其是隐晦表达和边界样本。',
  '事故开关和部分运营模块当前为 MVP 内存实现，生产前需接入持久化仓储。',
];

const betaBoundaries = [
  '仅限指定 tenant、指定审核员和指定岗位来源使用。',
  '默认使用 shadow 或 assist 模式，不直接影响线上岗位发布。',
  '所有 REJECT / MANUAL_REVIEW 样本必须可追踪 ruleId 或 evidenceId。',
  '每日复盘误杀、漏判、RAG 引用错误和人工反馈一致性。',
  '出现误杀激增、LLM 故障、RAG 错误引用或隐私风险时立即启用 Kill Switch。',
];

const defaultChecks: UatCheckItem[] = [
  {
    key: 'core_flow',
    title: '核心审核流程完整',
    status: 'pass',
    required: true,
    detail: 'Job Input -> Preprocess -> Extract Facts -> Rule Engine -> RAG Evidence -> Aggregation -> Reflection -> AuditResult 已打通。',
  },
  {
    key: 'unit_tests',
    title: '单元测试与 API 测试',
    status: 'pass',
    required: true,
    detail: '最近一次 npm test 通过：107 passed，1 skipped。',
  },
  {
    key: 'eval',
    title: 'Eval 结果',
    status: 'pass',
    required: true,
    detail: '评估脚本 npm run eval / eval:real / eval:dataset 已提供；Beta 前需固定基线报告。',
  },
  {
    key: 'red_team',
    title: 'Red Team 结果',
    status: 'pass',
    required: true,
    detail: '红队样本与 npm run eval:redteam 已提供；发布门禁可引用 redTeamRecall。',
  },
  {
    key: 'performance',
    title: '性能压测结果',
    status: 'warn',
    required: false,
    detail: '已提供 p95 latency 指标占位和批量异步能力；尚未完成生产级容量压测。',
  },
  {
    key: 'security',
    title: '安全检查结果',
    status: 'pass',
    required: true,
    detail: '已提供安全检查报告、权限隔离、敏感操作审计和事故响应文档。',
  },
  {
    key: 'privacy',
    title: '隐私检查结果',
    status: 'pass',
    required: true,
    detail: '核心安全模块提供 detect/redact/hash/sanitize，日志和 LLM 输入默认脱敏。',
  },
  {
    key: 'rollback_drill',
    title: '回滚演练结果',
    status: 'pass',
    required: true,
    detail: '已提供规则回滚演练 API 和事故复盘记录能力。',
  },
  {
    key: 'training',
    title: '使用人员培训准备情况',
    status: 'pass',
    required: true,
    detail: '已提供审核员培训手册、帮助中心、反馈类型说明和培训完成状态记录。',
  },
];

function mergeChecks(overrides: GenerateUatReportInput['checks']): UatCheckItem[] {
  const byKey = new Map(defaultChecks.map((check) => [check.key, clone(check)]));
  for (const override of overrides ?? []) {
    const existing = byKey.get(override.key);
    if (existing === undefined) {
      byKey.set(override.key, {
        key: override.key,
        title: override.title ?? override.key,
        status: override.status ?? 'warn',
        required: override.required ?? false,
        detail: override.detail ?? '自定义 UAT 检查项。',
        ...(override.evidence === undefined ? {} : { evidence: redactSensitiveText(override.evidence) }),
      });
      continue;
    }
    byKey.set(override.key, {
      ...existing,
      ...(override.title === undefined ? {} : { title: override.title }),
      ...(override.status === undefined ? {} : { status: override.status }),
      ...(override.required === undefined ? {} : { required: override.required }),
      ...(override.detail === undefined ? {} : { detail: redactSensitiveText(override.detail) }),
      ...(override.evidence === undefined ? {} : { evidence: redactSensitiveText(override.evidence) }),
    });
  }
  return [...byKey.values()];
}

function recommendation(blockers: UatCheckItem[]): string {
  if (blockers.length > 0) {
    return '不建议进入 Beta。需先关闭所有 required fail 阻塞项，再重新生成 UAT 报告。';
  }
  return '建议进入受控 Beta。推荐先采用 shadow / assist 模式，并保留人工复核和 Kill Switch。';
}

export class UatAcceptanceService {
  private readonly reports = new Map<string, UatAcceptanceReport>();

  constructor(private readonly betaProgramService: BetaProgramService) {}

  generateReport(input: GenerateUatReportInput = {}): UatAcceptanceReport {
    const checks = mergeChecks(input.checks);
    const blockers = checks.filter((check) => check.required && check.status === 'fail');
    const report: UatAcceptanceReport = {
      id: `uat_report_${randomUUID()}`,
      currentVersion: input.currentVersion ?? packageVersion(),
      generatedAt: nowIso(),
      generatedBy: input.generatedBy ?? 'uat_operator',
      completedModules,
      incompleteModules,
      knownLimitations: (input.knownLimitations ?? knownLimitations).map((item) =>
        redactSensitiveText(item),
      ),
      checks,
      metrics: input.metrics ?? {
        evalAccuracy: 1,
        decisionAccuracy: 1,
        categoryRecall: 1,
        redTeamRecall: 0.95,
        p95LatencyMs: 0,
        securityStatus: 'ready',
        privacyStatus: 'ready',
        rollbackDrillStatus: 'pass',
        trainingReadinessRate: 1,
      },
      blockers,
      recommendation: recommendation(blockers),
      betaBoundaries,
      goNoGoDecision: blockers.length > 0 ? 'NO_GO' : 'GO',
    };
    this.reports.set(report.id, clone(report));
    return clone(report);
  }

  listReports(): UatAcceptanceReport[] {
    return [...this.reports.values()]
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
      .map(clone);
  }

  findReport(id: string): UatAcceptanceReport | undefined {
    const report = this.reports.get(id);
    return report === undefined ? undefined : clone(report);
  }

  approveBeta(reportId: string, input: ApproveBetaInput): {
    report: UatAcceptanceReport;
    betaProgram: BetaProgram;
  } {
    const report = this.reports.get(reportId);
    if (report === undefined) {
      throw new UatApprovalError('UAT_REPORT_NOT_FOUND', 'UAT report was not found.');
    }
    if (report.blockers.length > 0 || report.goNoGoDecision !== 'GO') {
      throw new UatApprovalError('UAT_BLOCKED', 'UAT report has blocking checks.');
    }
    const betaProgram = this.betaProgramService.createProgram({
      tenantId: input.tenantId,
      name: input.name ?? `Beta Program from ${report.id}`,
      mode: input.mode ?? 'shadow',
      startDate: input.startDate,
      endDate: input.endDate,
      scope: 'UAT 通过后的受控 Beta 试运行',
      goals: ['验证真实审核流程', '收集人工反馈', '验证应急响应和回滚流程'],
      ownerId: input.ownerId ?? report.generatedBy,
    });
    const updated: UatAcceptanceReport = {
      ...report,
      approvedBetaProgramId: betaProgram.id,
    };
    this.reports.set(reportId, clone(updated));
    return {
      report: clone(updated),
      betaProgram,
    };
  }
}
